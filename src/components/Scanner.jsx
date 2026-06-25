import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from 'react'
import { FolderSearch, Pause, Play, Square, AlertTriangle, RefreshCw } from 'lucide-react'
import exifr from 'exifr'
import {
  createScanSession,
  updateScanSession,
  upsertPhoto,
  createSection,
  getPhotosForRetag,
  applyTags,
  updatePhotoStatus,
} from '../lib/supabase'
import { tagImage, RateLimitExhaustedError, resetUsage } from '../lib/tagger'

// Highlight known model names inside a status line.
const MODEL_WORDS = ['Gemini', 'OpenRouter', 'NVIDIA', 'Gemma']
function renderStatus(text) {
  for (const w of MODEL_WORDS) {
    const idx = text.indexOf(w)
    if (idx !== -1) {
      return (
        <>
          {text.slice(0, idx)}
          <span className="status-model">{w}</span>
          {text.slice(idx + w.length)}
        </>
      )
    }
  }
  return text
}

// Photo extensions we care about.
const RASTER_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'tif'])
const HEIC_EXT = new Set(['heic', 'heif']) // browser usually can't decode -> skip thumbnail
const RAW_EXT = new Set(['cr2', 'nef', 'arw', 'dng', 'orf', 'rw2'])
const ALL_EXT = new Set([...RASTER_EXT, ...HEIC_EXT, ...RAW_EXT])

// Canvas-decodable formats (for thumbnail + AI).
const CANVAS_EXT = RASTER_EXT

function extOf(name) {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i + 1).toLowerCase()
}

/** Recursively collect file handles for supported images. */
async function* walk(dirHandle, prefix) {
  for await (const entry of dirHandle.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.kind === 'directory') {
      yield* walk(entry, path)
    } else if (entry.kind === 'file') {
      const ext = extOf(entry.name)
      if (ALL_EXT.has(ext)) {
        yield { handle: entry, relPath: path, folder: prefix }
      }
    }
  }
}

/**
 * Build a JPEG thumbnail (max 400px) from an image blob using
 * createImageBitmap + OffscreenCanvas. Returns { dataUrl, width, height }.
 */
async function makeThumbnail(blob) {
  const bitmap = await createImageBitmap(blob)
  const { width, height } = bitmap
  const max = 400
  const scale = Math.min(1, max / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))

  let dataUrl
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, w, h)
    const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.72 })
    dataUrl = await blobToDataUrl(out)
  } else {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    dataUrl = canvas.toDataURL('image/jpeg', 0.72)
  }
  bitmap.close?.()
  return { dataUrl, width, height }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

const supportsFSA = typeof window !== 'undefined' && 'showDirectoryPicker' in window

const initialProgress = {
  total: 0,
  done: 0,
  tagged: 0,
  pending: 0,
  failed: 0,
  skipped: 0,
  current: '',
  currentModel: '',
  label: '',
}

const Scanner = forwardRef(function Scanner({ sections = [], onScanDone }, ref) {
  const [state, setState] = useState('idle') // idle | scanning | paused | done | exhausted
  const [phase, setPhase] = useState('scan') // scan | retag
  const [progress, setProgress] = useState(initialProgress)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [statusText, setStatusText] = useState('')
  const [dots, setDots] = useState('')

  // Section-chooser modal: { files, rootName } while waiting for a choice.
  const [chooser, setChooser] = useState(null)
  const [chooserSection, setChooserSection] = useState('') // '' = none, '__new__', or id
  const [newSectionName, setNewSectionName] = useState('')

  const pausedRef = useRef(false)
  const abortRef = useRef(false)
  const startTimeRef = useRef(0)

  // Animated trailing dots while scanning.
  useEffect(() => {
    if (state !== 'scanning') {
      setDots('')
      return
    }
    let n = 0
    const id = setInterval(() => {
      n = (n + 1) % 3
      setDots('.'.repeat(n + 1))
    }, 400)
    return () => clearInterval(id)
  }, [state])

  // Status updates emitted by the tagger (AI / fallback stages).
  useEffect(() => {
    const onStatus = (e) => setStatusText(e.detail?.text || '')
    window.addEventListener('tagger:status', onStatus)
    return () => window.removeEventListener('tagger:status', onStatus)
  }, [])

  const waitWhilePaused = useCallback(async () => {
    while (pausedRef.current && !abortRef.current) {
      await new Promise((r) => setTimeout(r, 200))
    }
  }, [])

  // ---------------- Core scan loop ----------------
  const runScan = useCallback(
    async (files, rootName, sectionId) => {
      abortRef.current = false
      pausedRef.current = false
      resetUsage()
      setStatusText('')
      setError('')
      setSummary(null)
      setPhase('scan')
      setState('scanning')
      setProgress({ ...initialProgress, total: files.length, label: rootName })
      startTimeRef.current = Date.now()

      let session
      try {
        session = await createScanSession(rootName)
      } catch (e) {
        setError(`Gagal membuat scan session: ${e.message}. Cek konfigurasi Supabase.`)
        setState('idle')
        return
      }

      const counters = { tagged: 0, pending: 0, failed: 0, skipped: 0 }

      for (let i = 0; i < files.length; i++) {
        if (abortRef.current) break
        await waitWhilePaused()
        if (abortRef.current) break

        const { handle, relPath, folder } = files[i]
        const ext = extOf(handle.name)
        const isRaw = RAW_EXT.has(ext)
        const canDecode = CANVAS_EXT.has(ext)

        setProgress((p) => ({ ...p, current: handle.name, currentModel: '' }))
        setStatusText('📂 Membaca file foto')

        let file
        try {
          file = await handle.getFile()
        } catch {
          counters.failed++
          setProgress((p) => ({ ...p, done: p.done + 1, failed: counters.failed }))
          continue
        }

        const baseRow = {
          filename: handle.name,
          filepath: relPath,
          folder: folder ? folder.split('/').pop() : rootName,
          folder_path: folder || rootName,
          file_size: file.size,
          scan_session_id: session.id,
          section_id: sectionId || null,
        }

        // RAW (and HEIC) → metadata only, skip thumbnail + AI.
        if (isRaw || !canDecode) {
          let takenAt = null
          try {
            const exif = await exifr.parse(file).catch(() => null)
            takenAt = exif?.DateTimeOriginal || exif?.CreateDate || null
          } catch {
            /* ignore */
          }
          try {
            await upsertPhoto(
              {
                ...baseRow,
                taken_at: takenAt ? new Date(takenAt).toISOString() : null,
                tag_status: 'skipped',
                tag_model: null,
                thumbnail_base64: null,
              },
              [],
            )
          } catch (e) {
            console.warn('upsert skipped photo failed:', e.message)
          }
          counters.skipped++
          setProgress((p) => ({ ...p, done: p.done + 1, skipped: counters.skipped }))
          continue
        }

        // Decodable raster: thumbnail + EXIF + AI tag.
        let thumb = null
        let exifDate = null
        setStatusText('🖼️ Membuat thumbnail')
        try {
          const [t, exif] = await Promise.all([
            makeThumbnail(file),
            exifr.parse(file).catch(() => null),
          ])
          thumb = t
          exifDate = exif?.DateTimeOriginal || exif?.CreateDate || null
        } catch (e) {
          console.warn('thumbnail failed for', handle.name, e.message)
          try {
            await upsertPhoto({ ...baseRow, tag_status: 'failed' }, [])
          } catch {
            /* ignore */
          }
          counters.failed++
          setProgress((p) => ({ ...p, done: p.done + 1, failed: counters.failed }))
          continue
        }

        const base64 = thumb.dataUrl.split(',')[1]
        let tagResult = null
        let status = 'pending'
        try {
          tagResult = await tagImage(base64, 'image/jpeg')
          status = 'tagged'
          setProgress((p) => ({ ...p, currentModel: tagResult.modelLabel || tagResult.model }))
        } catch (e) {
          if (e instanceof RateLimitExhaustedError) {
            try {
              await upsertPhoto(
                {
                  ...baseRow,
                  width: thumb.width,
                  height: thumb.height,
                  taken_at: exifDate ? new Date(exifDate).toISOString() : null,
                  tag_status: 'pending',
                  tag_model: null,
                  thumbnail_base64: thumb.dataUrl,
                },
                [],
              )
            } catch {
              /* ignore */
            }
            counters.pending++
            const finalDone = i + 1
            setProgress((p) => ({ ...p, done: finalDone, pending: counters.pending }))
            await updateScanSession(session.id, {
              finished_at: new Date().toISOString(),
              total_found: files.length,
              total_tagged: counters.tagged,
              total_failed: counters.failed,
              status: 'aborted',
            })
            finishExhausted(counters, files.length - finalDone)
            return
          }
          status = 'pending'
          console.warn('tagging error:', e.message)
        }

        setStatusText('💾 Menyimpan ke database')
        try {
          await upsertPhoto(
            {
              ...baseRow,
              width: thumb.width,
              height: thumb.height,
              taken_at: exifDate ? new Date(exifDate).toISOString() : null,
              tag_status: status,
              tag_model: tagResult?.model || null,
              thumbnail_base64: thumb.dataUrl,
            },
            tagResult?.tags || [],
          )
        } catch (e) {
          console.warn('upsert failed:', e.message)
        }

        if (status === 'tagged') counters.tagged++
        else counters.pending++
        setStatusText('✅ Selesai!')
        setProgress((p) => ({
          ...p,
          done: p.done + 1,
          tagged: counters.tagged,
          pending: counters.pending,
        }))
      }

      const aborted = abortRef.current
      await updateScanSession(session.id, {
        finished_at: new Date().toISOString(),
        total_found: files.length,
        total_tagged: counters.tagged,
        total_failed: counters.failed,
        status: aborted ? 'aborted' : 'finished',
      })
      finishDone(counters, files.length, aborted)
    },
    [waitWhilePaused, onScanDone],
  )

  // ---------------- Re-tag loop (uses stored thumbnails) ----------------
  const runRetag = useCallback(
    async (photos, label) => {
      abortRef.current = false
      pausedRef.current = false
      resetUsage()
      setStatusText('')
      setError('')
      setSummary(null)
      setPhase('retag')
      setState('scanning')
      setProgress({ ...initialProgress, total: photos.length, label })
      startTimeRef.current = Date.now()

      const counters = { tagged: 0, pending: 0, failed: 0, skipped: 0 }

      for (let i = 0; i < photos.length; i++) {
        if (abortRef.current) break
        await waitWhilePaused()
        if (abortRef.current) break

        const p = photos[i]
        setProgress((s) => ({ ...s, current: p.filename, currentModel: '' }))

        if (!p.thumbnail_base64) {
          counters.skipped++
          setProgress((s) => ({ ...s, done: s.done + 1, skipped: counters.skipped }))
          continue
        }

        const base64 = p.thumbnail_base64.split(',')[1]
        try {
          const tagResult = await tagImage(base64, 'image/jpeg')
          setStatusText('💾 Menyimpan ke database')
          await applyTags(p.id, tagResult.tags, tagResult.model, 'tagged')
          counters.tagged++
          setStatusText('✅ Selesai!')
          setProgress((s) => ({
            ...s,
            done: s.done + 1,
            tagged: counters.tagged,
            currentModel: tagResult.modelLabel || tagResult.model,
          }))
        } catch (e) {
          if (e instanceof RateLimitExhaustedError) {
            await updatePhotoStatus(p.id, 'pending')
            counters.pending++
            const finalDone = i + 1
            setProgress((s) => ({ ...s, done: finalDone, pending: counters.pending }))
            finishExhausted(counters, photos.length - finalDone)
            return
          }
          await updatePhotoStatus(p.id, 'pending')
          counters.pending++
          console.warn('retag error:', e.message)
          setProgress((s) => ({ ...s, done: s.done + 1, pending: counters.pending }))
        }
      }

      finishDone(counters, photos.length, abortRef.current)
    },
    [waitWhilePaused, onScanDone],
  )

  // ---------------- Finishers ----------------
  function finishDone(counters, total, aborted) {
    setStatusText('')
    setSummary({
      total,
      ...counters,
      remaining: 0,
      seconds: Math.round((Date.now() - startTimeRef.current) / 1000),
      exhausted: false,
      aborted,
    })
    setState('done')
    onScanDone?.()
  }

  function finishExhausted(counters, remaining) {
    setStatusText('')
    setSummary({
      total: counters.tagged + counters.pending + counters.failed + counters.skipped + remaining,
      ...counters,
      remaining,
      seconds: Math.round((Date.now() - startTimeRef.current) / 1000),
      exhausted: true,
    })
    setState('exhausted')
    onScanDone?.()
  }

  // ---------------- Folder picking + section chooser ----------------
  const pickFolder = useCallback(
    async (presetSectionId) => {
      if (!supportsFSA || state === 'scanning' || state === 'paused') return
      let dirHandle
      try {
        dirHandle = await window.showDirectoryPicker({ mode: 'read' })
      } catch {
        return // cancelled
      }
      const rootName = dirHandle.name
      const files = []
      for await (const f of walk(dirHandle, rootName)) files.push(f)

      if (presetSectionId) {
        runScan(files, rootName, presetSectionId)
      } else {
        // Ask which section to scan into.
        setChooserSection('')
        setNewSectionName('')
        setChooser({ files, rootName })
      }
    },
    [state, runScan],
  )

  const confirmChooser = useCallback(async () => {
    if (!chooser) return
    const { files, rootName } = chooser
    let sectionId = null
    try {
      if (chooserSection === '__new__') {
        const created = await createSection({ name: newSectionName || rootName })
        sectionId = created.id
      } else if (chooserSection) {
        sectionId = chooserSection
      }
    } catch (e) {
      setError(`Gagal membuat section: ${e.message}`)
    }
    setChooser(null)
    runScan(files, rootName, sectionId)
  }, [chooser, chooserSection, newSectionName, runScan])

  // ---------------- Imperative API for App / SectionManager ----------------
  useImperativeHandle(ref, () => ({
    scan: (presetSectionId) => pickFolder(presetSectionId),
    retag: async ({ scope, value, label }) => {
      if (state === 'scanning' || state === 'paused') return
      let photos
      if (scope === 'photo') {
        photos = Array.isArray(value) ? value : [value]
      } else {
        try {
          photos = await getPhotosForRetag({ scope, value })
        } catch (e) {
          setError(`Gagal ambil foto untuk re-tag: ${e.message}`)
          return
        }
      }
      if (!photos.length) {
        setError('Tidak ada foto yang bisa di-retag (butuh thumbnail).')
        return
      }
      await runRetag(photos, label || 'Re-tag')
    },
  }))

  // ---------------- Render ----------------
  if (!supportsFSA) {
    return (
      <div className="scanner scanner--warn">
        <AlertTriangle size={18} />
        <span>
          Browser kamu tidak mendukung <b>File System Access API</b>. Gunakan Chrome atau Edge
          (desktop) untuk fitur scan folder.
        </span>
      </div>
    )
  }

  const busy = state === 'scanning' || state === 'paused'
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="scanner">
      <div className="scanner__row">
        {!busy && (
          <button type="button" className="btn btn--primary" onClick={() => pickFolder(null)}>
            <FolderSearch size={16} /> Pilih Folder &amp; Scan
          </button>
        )}

        {busy && (
          <>
            <span className="scanner__phase">
              {phase === 'retag' ? <RefreshCw size={15} /> : <FolderSearch size={15} />}
              {phase === 'retag' ? 'Re-tagging' : 'Scanning'}
              {progress.label ? `: ${progress.label}` : ''}
            </span>
            <button type="button" className="btn" onClick={() => {
              pausedRef.current = !pausedRef.current
              setState(pausedRef.current ? 'paused' : 'scanning')
            }}>
              {state === 'paused' ? <Play size={16} /> : <Pause size={16} />}
              {state === 'paused' ? 'Resume' : 'Pause'}
            </button>
            <button type="button" className="btn btn--danger" onClick={() => {
              abortRef.current = true
              pausedRef.current = false
            }}>
              <Square size={16} /> Stop
            </button>
          </>
        )}
      </div>

      {error && <div className="scanner__error">{error}</div>}

      {busy && (
        <div className="scanner__progress">
          <div className="progress-bar">
            <div
              className={`progress-bar__fill${state === 'scanning' ? ' progress-bar__fill--active' : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="scanner__progress-text">
            <span>
              Foto {progress.done} / {progress.total} ({pct}%)
            </span>
            {progress.current && (
              <span className="scanner__current" title={progress.current}>
                {progress.current}
              </span>
            )}
          </div>
          <div className="scanner__counters">
            <span style={{ color: '#3ecf8e' }}>tagged {progress.tagged}</span>
            <span style={{ color: '#f5a623' }}>pending {progress.pending}</span>
            <span style={{ color: '#f55a5a' }}>failed {progress.failed}</span>
            <span style={{ color: 'var(--muted)' }}>skipped {progress.skipped}</span>
          </div>

          {statusText && (
            <div className="scanner__status">
              <span className="scanner__status-dot" />
              <span className="scanner__status-text">
                {renderStatus(statusText)}
                {!statusText.startsWith('✅') ? dots : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {state === 'exhausted' && summary && (
        <div className="scanner__summary scanner__summary--warn">
          <AlertTriangle size={16} />
          <div>
            <b>Semua model sudah mencapai limit hari ini.</b> Sisa {summary.remaining} foto disimpan
            sebagai <i>pending</i>. Buka lagi besok untuk lanjutkan. ({summary.tagged} tagged,{' '}
            {summary.pending} pending, {summary.failed} failed, {summary.skipped} skipped dalam{' '}
            {summary.seconds}s)
          </div>
        </div>
      )}

      {state === 'done' && summary && (
        <div className="scanner__summary">
          {summary.aborted ? 'Dihentikan.' : 'Selesai!'} {summary.total} foto · {summary.tagged}{' '}
          tagged · {summary.pending} pending · {summary.failed} failed · {summary.skipped} skipped ·{' '}
          {summary.seconds}s
        </div>
      )}

      {/* Section chooser modal */}
      {chooser && (
        <div className="modal-overlay" onClick={() => setChooser(null)}>
          <div className="modal modal--narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal__info">
              <h2 className="modal__title">Tambahkan ke section mana?</h2>
              <p className="hint">
                Folder <b>{chooser.rootName}</b> · {chooser.files.length} foto ditemukan.
              </p>

              <div className="field">
                <label>Section</label>
                <select
                  className="select"
                  style={{ width: '100%' }}
                  value={chooserSection}
                  onChange={(e) => setChooserSection(e.target.value)}
                >
                  <option value="">(Tanpa section)</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value="__new__">+ Buat section baru…</option>
                </select>
              </div>

              {chooserSection === '__new__' && (
                <div className="field">
                  <label>Nama section baru</label>
                  <input
                    className="select"
                    style={{ width: '100%' }}
                    placeholder={chooser.rootName}
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    autoFocus
                  />
                </div>
              )}

              <div className="scanner__row" style={{ marginTop: 8 }}>
                <button type="button" className="btn btn--primary" onClick={confirmChooser}>
                  <FolderSearch size={15} /> Mulai Scan
                </button>
                <button type="button" className="btn" onClick={() => setChooser(null)}>
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

export default Scanner
