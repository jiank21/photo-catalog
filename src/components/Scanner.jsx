import { useRef, useState, useCallback } from 'react'
import { FolderSearch, Pause, Play, Square, AlertTriangle } from 'lucide-react'
import exifr from 'exifr'
import {
  createScanSession,
  updateScanSession,
  upsertPhoto,
} from '../lib/supabase'
import {
  tagImage,
  RateLimitExhaustedError,
  getUsage,
  resetUsage,
  allExhausted,
} from '../lib/tagger'

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

function mimeFor(ext) {
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'bmp':
      return 'image/bmp'
    case 'tiff':
    case 'tif':
      return 'image/tiff'
    default:
      return 'image/jpeg'
  }
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
    // Fallback to a regular canvas.
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
}

export default function Scanner({ onScanDone }) {
  const [state, setState] = useState('idle') // idle | scanning | paused | done | exhausted
  const [progress, setProgress] = useState(initialProgress)
  const [usageRows, setUsageRows] = useState(getUsage())
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')

  // Mutable control flags (don't trigger re-render).
  const pausedRef = useRef(false)
  const abortRef = useRef(false)
  const startTimeRef = useRef(0)

  const refreshUsage = () => setUsageRows(getUsage())

  const waitWhilePaused = useCallback(async () => {
    while (pausedRef.current && !abortRef.current) {
      await new Promise((r) => setTimeout(r, 200))
    }
  }, [])

  const startScan = useCallback(async () => {
    if (!supportsFSA) return
    setError('')
    setSummary(null)
    resetUsage()
    refreshUsage()

    let dirHandle
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'read' })
    } catch {
      return // user cancelled
    }

    abortRef.current = false
    pausedRef.current = false
    setState('scanning')
    setProgress(initialProgress)
    startTimeRef.current = Date.now()

    const rootName = dirHandle.name

    // First pass: collect all files so we can show an accurate total.
    const files = []
    for await (const f of walk(dirHandle, rootName)) files.push(f)

    let session
    try {
      session = await createScanSession(rootName)
    } catch (e) {
      setError(`Gagal membuat scan session: ${e.message}. Cek konfigurasi Supabase.`)
      setState('idle')
      return
    }

    const counters = { tagged: 0, pending: 0, failed: 0, skipped: 0 }
    setProgress({ ...initialProgress, total: files.length })

    for (let i = 0; i < files.length; i++) {
      if (abortRef.current) break
      await waitWhilePaused()
      if (abortRef.current) break

      const { handle, relPath, folder } = files[i]
      const ext = extOf(handle.name)
      const isRaw = RAW_EXT.has(ext)
      const canDecode = CANVAS_EXT.has(ext)

      setProgress((p) => ({ ...p, current: handle.name, currentModel: '' }))

      let file
      try {
        file = await handle.getFile()
      } catch {
        counters.failed++
        setProgress((p) => ({ ...p, done: p.done + 1, failed: counters.failed }))
        continue
      }

      // Absolute-ish path for reference. The picker only gives relative
      // paths; we store the relative path rooted at the chosen folder.
      const filepath = relPath
      const folderPath = folder || rootName

      const baseRow = {
        filename: handle.name,
        filepath,
        folder: folder ? folder.split('/').pop() : rootName,
        folder_path: folderPath,
        file_size: file.size,
        scan_session_id: session.id,
      }

      // RAW (and HEIC) → store metadata only, skip thumbnail + AI.
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

      // Decodable raster image: thumbnail + EXIF + AI tag.
      let thumb = null
      let exifDate = null
      try {
        const [t, exif] = await Promise.all([
          makeThumbnail(file),
          exifr.parse(file).catch(() => null),
        ])
        thumb = t
        exifDate = exif?.DateTimeOriginal || exif?.CreateDate || null
      } catch (e) {
        // Could not decode (corrupt / unsupported) → mark failed.
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
          // Save this one as pending and stop the batch.
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
          refreshUsage()
          setProgress((p) => ({ ...p, done: finalDone, pending: counters.pending }))
          // Finalize as exhausted.
          await updateScanSession(session.id, {
            finished_at: new Date().toISOString(),
            total_found: files.length,
            total_tagged: counters.tagged,
            total_failed: counters.failed,
            status: 'aborted',
          })
          const remaining = files.length - finalDone
          setSummary({
            total: files.length,
            ...counters,
            remaining,
            seconds: Math.round((Date.now() - startTimeRef.current) / 1000),
            exhausted: true,
          })
          setState('exhausted')
          onScanDone?.()
          return
        }
        // Other tagging error → pending (not failed; image is fine).
        status = 'pending'
        console.warn('tagging error:', e.message)
      }

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

      refreshUsage()
      setProgress((p) => ({
        ...p,
        done: p.done + 1,
        tagged: counters.tagged,
        pending: counters.pending,
      }))

      if (allExhausted()) {
        // Edge case: became exhausted on the last successful call.
      }
    }

    // Normal completion (or aborted by user).
    const aborted = abortRef.current
    await updateScanSession(session.id, {
      finished_at: new Date().toISOString(),
      total_found: files.length,
      total_tagged: counters.tagged,
      total_failed: counters.failed,
      status: aborted ? 'aborted' : 'finished',
    })

    setSummary({
      total: files.length,
      ...counters,
      remaining: 0,
      seconds: Math.round((Date.now() - startTimeRef.current) / 1000),
      exhausted: false,
      aborted,
    })
    setState('done')
    onScanDone?.()
  }, [waitWhilePaused, onScanDone])

  const togglePause = () => {
    pausedRef.current = !pausedRef.current
    setState(pausedRef.current ? 'paused' : 'scanning')
  }

  const stopScan = () => {
    abortRef.current = true
    pausedRef.current = false
  }

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
          <button type="button" className="btn btn--primary" onClick={startScan}>
            <FolderSearch size={16} /> Pilih Folder &amp; Scan
          </button>
        )}

        {busy && (
          <>
            <button type="button" className="btn" onClick={togglePause}>
              {state === 'paused' ? <Play size={16} /> : <Pause size={16} />}
              {state === 'paused' ? 'Resume' : 'Pause'}
            </button>
            <button type="button" className="btn btn--danger" onClick={stopScan}>
              <Square size={16} /> Stop
            </button>
          </>
        )}
      </div>

      {error && <div className="scanner__error">{error}</div>}

      {busy && (
        <div className="scanner__progress">
          <div className="progress-bar">
            <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="scanner__progress-text">
            <span>
              Foto {progress.done} / {progress.total} ({pct}%)
            </span>
            {progress.current && (
              <span className="scanner__current" title={progress.current}>
                {progress.current}
                {progress.currentModel ? ` · ${progress.currentModel}` : ''}
              </span>
            )}
          </div>
          <div className="scanner__counters">
            <span style={{ color: '#3ecf8e' }}>tagged {progress.tagged}</span>
            <span style={{ color: '#f5a623' }}>pending {progress.pending}</span>
            <span style={{ color: '#f55a5a' }}>failed {progress.failed}</span>
            <span style={{ color: 'var(--muted)' }}>skipped {progress.skipped}</span>
          </div>

          {/* Per-model usage */}
          <div className="usage-grid">
            {usageRows.map((u) => (
              <div key={u.id} className={`usage-chip${u.exhausted ? ' usage-chip--out' : ''}`}>
                <span className="usage-chip__label">{u.label}</span>
                <span className="usage-chip__count">
                  {u.used}/{u.limit}
                  {u.exhausted ? ' · limit' : ''}
                </span>
              </div>
            ))}
          </div>
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
          {summary.aborted ? 'Scan dihentikan.' : 'Scan selesai!'} Ditemukan {summary.total} foto ·{' '}
          {summary.tagged} tagged · {summary.pending} pending · {summary.failed} failed ·{' '}
          {summary.skipped} skipped · {summary.seconds}s
        </div>
      )}
    </div>
  )
}
