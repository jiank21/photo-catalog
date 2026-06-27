import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from 'react'
import {
  FolderSearch,
  Pause,
  Play,
  Square,
  AlertTriangle,
  RefreshCw,
  ScanLine,
  FolderOpen,
  ImagePlus,
  MapPin,
  Bot,
  ArrowRightLeft,
  Save,
  CheckCircle2,
} from 'lucide-react'
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
import { extractExif, reverseGeocode, exifToTags } from '../lib/exif'
import { addNotification } from '../lib/notifications'
import { cn } from '../lib/cn'

// Extract EXIF + reverse-geocode GPS into one bundle.
async function gatherExif(file) {
  const exifData = await extractExif(file)
  let gpsLocation = null
  if (exifData?.gpsLat && exifData?.gpsLng) {
    gpsLocation = await reverseGeocode(exifData.gpsLat, exifData.gpsLng)
  }
  const exifTags = exifData ? exifToTags(exifData, gpsLocation) : []
  return { exifData, gpsLocation, exifTags }
}

// Map EXIF bundle → photos table columns.
function exifColumns(exifData, gpsLocation) {
  return {
    camera_make: exifData?.cameraMake || null,
    camera_model: exifData?.cameraModel || null,
    lens_model: exifData?.lensModel || null,
    aperture: exifData?.aperture || null,
    shutter_speed: exifData?.shutterSpeed || null,
    iso: exifData?.iso || null,
    focal_length: exifData?.focalLength || null,
    flash: exifData?.flash || null,
    exposure_mode: exifData?.exposureMode || null,
    gps_lat: exifData?.gpsLat || null,
    gps_lng: exifData?.gpsLng || null,
    gps_location: gpsLocation || null,
  }
}

// Highlight known model names inside a status line.
const MODEL_WORDS = ['Gemini', 'OpenRouter', 'NVIDIA', 'Gemma']
function renderStatus(text) {
  for (const w of MODEL_WORDS) {
    const idx = text.indexOf(w)
    if (idx !== -1) {
      return (
        <>
          {text.slice(0, idx)}
          <span className="font-semibold text-brand-500">{w}</span>
          {text.slice(idx + w.length)}
        </>
      )
    }
  }
  return text
}

// Map a status line (emoji-prefixed) to a lucide icon + cleaned text.
function parseStatus(text) {
  const clean = text.replace(/^[^\p{L}\p{N}]+/u, '').trim()
  let Icon = null
  let cls = ''
  if (/Selesai/i.test(text) || text.startsWith('✅')) {
    Icon = CheckCircle2
    cls = 'text-emerald-500'
  } else if (/Membaca file/i.test(text)) Icon = FolderOpen
  else if (/thumbnail/i.test(text)) Icon = ImagePlus
  else if (/EXIF/i.test(text)) Icon = ScanLine
  else if (/lokasi/i.test(text)) Icon = MapPin
  else if (/Menganalisis|Menambah detail/i.test(text)) Icon = Bot
  else if (/Fallback/i.test(text)) Icon = ArrowRightLeft
  else if (/Menyimpan/i.test(text)) Icon = Save
  return { Icon, cls, clean }
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

const cardClass =
  'rounded-2xl border border-gray-100 bg-white p-6 shadow-card dark:border-navy-700 dark:bg-navy-800 dark:shadow-card-dark'

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
          setStatusText('🔍 Membaca metadata EXIF...')
          const { exifData, gpsLocation, exifTags } = await gatherExif(file)
          try {
            await upsertPhoto(
              {
                ...baseRow,
                ...exifColumns(exifData, gpsLocation),
                taken_at: exifData?.takenAt ? new Date(exifData.takenAt).toISOString() : null,
                tag_status: 'skipped',
                tag_model: null,
                thumbnail_base64: null,
              },
              [],
              exifTags,
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
        setStatusText('🖼️ Membuat thumbnail')
        try {
          thumb = await makeThumbnail(file)
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

        // EXIF metadata + GPS reverse-geocode (before AI tagging).
        setStatusText('🔍 Membaca metadata EXIF...')
        const exifData = await extractExif(file)
        let gpsLocation = null
        if (exifData?.gpsLat && exifData?.gpsLng) {
          setStatusText('📍 Mendapatkan lokasi foto...')
          gpsLocation = await reverseGeocode(exifData.gpsLat, exifData.gpsLng)
        }
        const exifTags = exifData ? exifToTags(exifData, gpsLocation) : []
        const takenAtIso = exifData?.takenAt ? new Date(exifData.takenAt).toISOString() : null
        const exifCols = exifColumns(exifData, gpsLocation)

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
                  ...exifCols,
                  width: thumb.width,
                  height: thumb.height,
                  taken_at: takenAtIso,
                  tag_status: 'pending',
                  tag_model: null,
                  thumbnail_base64: thumb.dataUrl,
                },
                [],
                exifTags,
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
            if (counters.tagged > 0) {
              addNotification('tag_complete', `Tagging selesai: ${counters.tagged} foto ter-tag`)
            }
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
              ...exifCols,
              width: thumb.width,
              height: thumb.height,
              taken_at: takenAtIso,
              tag_status: status,
              tag_model: tagResult?.model || null,
              thumbnail_base64: thumb.dataUrl,
            },
            tagResult?.tags || [],
            exifTags,
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
      if (!aborted) {
        addNotification('scan_complete', `Scan selesai: ${files.length} foto ditemukan`)
        if (counters.tagged > 0) {
          addNotification('tag_complete', `Tagging selesai: ${counters.tagged} foto ter-tag`)
        }
      }
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
            if (counters.tagged > 0) {
              addNotification('retag_complete', `Re-tag selesai: ${counters.tagged} foto diperbarui`)
            }
            return
          }
          await updatePhotoStatus(p.id, 'pending')
          counters.pending++
          console.warn('retag error:', e.message)
          setProgress((s) => ({ ...s, done: s.done + 1, pending: counters.pending }))
        }
      }

      finishDone(counters, photos.length, abortRef.current)
      if (!abortRef.current) {
        addNotification('retag_complete', `Re-tag selesai: ${counters.tagged} foto diperbarui`)
      }
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

  // ---------------- Imperative API for App / Sidebar ----------------
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
      <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-600 dark:text-amber-400">
        <AlertTriangle size={18} className="shrink-0" />
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
    <div className={cardClass}>
      {!busy && (
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-purple-500 text-white shadow-md">
              <ScanLine size={26} />
            </span>
            <div>
              <h2 className="text-lg font-bold">Scan Folder Foto</h2>
              <p className="text-sm text-gray-400">
                Pilih folder di harddisk untuk membaca &amp; menandai foto otomatis.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 px-6 py-3 font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            onClick={() => pickFolder(null)}
          >
            <FolderSearch size={18} /> Pilih Folder &amp; Scan
          </button>
        </div>
      )}

      {busy && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="mr-auto inline-flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-300">
            {phase === 'retag' ? <RefreshCw size={15} /> : <FolderSearch size={15} />}
            {phase === 'retag' ? 'Re-tagging' : 'Scanning'}
            {progress.label ? `: ${progress.label}` : ''}
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:border-brand-300 dark:border-navy-600 dark:bg-navy-700 dark:text-gray-300"
            onClick={() => {
              pausedRef.current = !pausedRef.current
              setState(pausedRef.current ? 'paused' : 'scanning')
            }}
          >
            {state === 'paused' ? <Play size={16} /> : <Pause size={16} />}
            {state === 'paused' ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/10 px-4 py-2 text-sm font-medium text-red-500 transition hover:bg-red-500 hover:text-white"
            onClick={() => {
              abortRef.current = true
              pausedRef.current = false
            }}
          >
            <Square size={16} /> Stop
          </button>
        </div>
      )}

      {error && <div className="mt-3 text-sm text-red-500">{error}</div>}

      {busy && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-navy-700">
            <div
              className={
                'h-full rounded-full bg-brand-500 transition-all duration-300' +
                (state === 'scanning' ? ' animate-shimmer bg-[length:200%_auto]' : '')
              }
              style={
                state === 'scanning'
                  ? {
                      width: `${pct}%`,
                      backgroundImage:
                        'linear-gradient(90deg, #444CE7 0%, #6172F3 40%, #A4BCFC 50%, #6172F3 60%, #444CE7 100%)',
                    }
                  : { width: `${pct}%` }
              }
            />
          </div>
          <div className="flex justify-between gap-3 text-sm text-gray-400">
            <span>
              Foto {progress.done} / {progress.total} ({pct}%)
            </span>
            {progress.current && (
              <span className="max-w-[60%] truncate" title={progress.current}>
                {progress.current}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-500">
              tagged {progress.tagged}
            </span>
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-500">
              pending {progress.pending}
            </span>
            <span className="rounded-full bg-red-500/10 px-2.5 py-1 font-medium text-red-500">
              failed {progress.failed}
            </span>
            <span className="rounded-full bg-gray-400/10 px-2.5 py-1 font-medium text-gray-400">
              skipped {progress.skipped}
            </span>
          </div>

          {statusText &&
            (() => {
              const { Icon, cls, clean } = parseStatus(statusText)
              const done = statusText.startsWith('✅')
              return (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300">
                  {Icon ? (
                    <Icon size={15} className={cn('shrink-0', cls, !done && 'animate-pulse')} />
                  ) : (
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
                  )}
                  <span className="min-w-0 truncate">
                    {renderStatus(clean)}
                    {!done ? dots : ''}
                  </span>
                </div>
              )
            })()}
        </div>
      )}

      {state === 'exhausted' && summary && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <b>Semua model sudah mencapai limit hari ini.</b> Sisa {summary.remaining} foto disimpan
            sebagai <i>pending</i>. Buka lagi besok untuk lanjutkan. ({summary.tagged} tagged,{' '}
            {summary.pending} pending, {summary.failed} failed, {summary.skipped} skipped dalam{' '}
            {summary.seconds}s)
          </div>
        </div>
      )}

      {state === 'done' && summary && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-navy-700 dark:bg-navy-700">
          {summary.aborted ? 'Dihentikan.' : 'Selesai!'} {summary.total} foto · {summary.tagged}{' '}
          tagged · {summary.pending} pending · {summary.failed} failed · {summary.skipped} skipped ·{' '}
          {summary.seconds}s
        </div>
      )}

      {/* Section chooser modal */}
      {chooser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm"
          onClick={() => setChooser(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl dark:border-navy-700 dark:bg-navy-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">Tambahkan ke section mana?</h2>
            <p className="mt-1 text-sm text-gray-400">
              Folder <b className="text-gray-600 dark:text-gray-200">{chooser.rootName}</b> ·{' '}
              {chooser.files.length} foto ditemukan.
            </p>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Section
              </label>
              <select
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-navy-600 dark:bg-navy-900 dark:text-white"
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
              <div className="mt-3">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                  Nama section baru
                </label>
                <input
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-navy-600 dark:bg-navy-900 dark:text-white"
                  placeholder={chooser.rootName}
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:-translate-y-0.5"
                onClick={confirmChooser}
              >
                <FolderSearch size={15} /> Mulai Scan
              </button>
              <button
                type="button"
                className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 dark:border-navy-600 dark:text-gray-300 dark:hover:bg-navy-700"
                onClick={() => setChooser(null)}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

export default Scanner
