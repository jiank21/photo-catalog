import { useEffect, useState, useCallback } from 'react'
import { X, Copy, Check, Plus, FolderInput, Wand2, Camera, MapPin, Info, Hash, ExternalLink } from 'lucide-react'
import { supabase, addManualTag, removeTag } from '../lib/supabase'
import TagBadge from './TagBadge'

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

function formatDate(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString()
  } catch {
    return d
  }
}

function Meta({ label, children, title }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-gray-400">{label}</span>
      <span className="truncate text-sm font-medium" title={title}>
        {children}
      </span>
    </div>
  )
}

export default function PhotoModal({ photo, onClose, onSearchTag, onTagsChanged, onRetagPhoto }) {
  const [copied, setCopied] = useState(false)
  const [tagRows, setTagRows] = useState([])
  const [newTag, setNewTag] = useState('')
  const [saving, setSaving] = useState(false)
  const [retagging, setRetagging] = useState(false)

  const loadTags = useCallback(async () => {
    if (!photo) return
    const { data } = await supabase
      .from('tags')
      .select('tag, source')
      .eq('photo_id', photo.id)
      .order('source', { ascending: false })
    setTagRows(data || [])
  }, [photo])

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = photo
        ? await supabase
            .from('tags')
            .select('tag, source')
            .eq('photo_id', photo.id)
            .order('source', { ascending: false })
        : { data: [] }
      if (active) setTagRows(data || [])
    })()
    return () => {
      active = false
    }
  }, [photo])

  const handleRetag = async () => {
    if (!photo || !onRetagPhoto) return
    setRetagging(true)
    try {
      await onRetagPhoto(photo)
      await loadTags()
      onTagsChanged?.()
    } finally {
      setRetagging(false)
    }
  }

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!photo) return null

  const cameraStr = [photo.camera_make, photo.camera_model].filter(Boolean).join(' ').trim()
  const hasExif = !!(
    photo.camera_make ||
    photo.camera_model ||
    photo.lens_model ||
    photo.aperture ||
    photo.shutter_speed ||
    photo.iso ||
    photo.focal_length ||
    photo.flash ||
    photo.exposure_mode ||
    photo.gps_location ||
    photo.gps_lat
  )

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(photo.filepath)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    const t = newTag.toLowerCase().trim()
    if (!t || tagRows.some((r) => r.tag === t)) {
      setNewTag('')
      return
    }
    setSaving(true)
    try {
      await addManualTag(photo.id, t)
      setTagRows((rows) => [...rows, { tag: t, source: 'manual' }])
      setNewTag('')
      onTagsChanged?.()
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (tag) => {
    setTagRows((rows) => rows.filter((r) => r.tag !== tag))
    await removeTag(photo.id, tag)
    onTagsChanged?.()
  }

  const statusColor =
    {
      tagged: 'text-emerald-500',
      pending: 'text-amber-500',
      failed: 'text-red-500',
      skipped: 'text-gray-400',
    }[photo.tag_status] || 'text-gray-400'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-[900px] overflow-auto rounded-3xl border border-gray-100 bg-white shadow-2xl dark:border-navy-700 dark:bg-navy-800"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-black/40 text-white transition hover:bg-black/70"
          onClick={onClose}
          aria-label="Tutup"
        >
          <X size={20} />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-[45%_55%]">
          <div className="flex min-h-[260px] items-center justify-center rounded-t-3xl bg-gray-50 dark:bg-navy-900 md:rounded-l-3xl md:rounded-tr-none">
            {photo.thumbnail_base64 ? (
              <img
                src={photo.thumbnail_base64}
                alt={photo.filename}
                className="max-h-[500px] max-w-full object-contain"
              />
            ) : (
              <div className="p-10 text-center text-gray-400">Tidak ada thumbnail (RAW / skipped)</div>
            )}
          </div>

          <div className="flex flex-col gap-5 p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="break-all text-xl font-bold">{photo.filename}</h2>
              {onRetagPhoto && photo.thumbnail_base64 && (
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-brand-500/50 px-3 py-1.5 text-sm font-medium text-brand-500 transition hover:bg-brand-500/10 disabled:opacity-50"
                  onClick={handleRetag}
                  disabled={retagging}
                  title="Jalankan AI tagging ulang untuk foto ini"
                >
                  <Wand2 size={14} className={retagging ? 'animate-pulse' : undefined} />
                  {retagging ? 'Re-tagging…' : 'Re-tag'}
                </button>
              )}
            </div>

            {/* Filepath + copy */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs uppercase tracking-wide text-gray-400">
                <MapPin size={14} /> Path lengkap
              </label>
              <div className="flex items-stretch gap-2">
                <code className="flex-1 break-all rounded-xl bg-gray-50 p-3 font-mono text-xs dark:bg-navy-900">
                  {photo.filepath}
                </code>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-600 transition hover:border-brand-300 dark:border-navy-600 dark:text-gray-300"
                  onClick={copyPath}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Tersalin' : 'Copy'}
                </button>
              </div>
              <p className="mt-1.5 flex items-center gap-1 text-xs text-gray-400">
                <FolderInput size={13} /> Buka File Explorer → paste path di address bar.
              </p>
            </div>

            {/* Metadata */}
            <div>
              <label className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wide text-gray-400">
                <Info size={14} /> Info
              </label>
              <div className="grid grid-cols-2 gap-3">
              <Meta label="Ukuran">{formatBytes(photo.file_size)}</Meta>
              <Meta label="Resolusi">
                {photo.width && photo.height ? `${photo.width}×${photo.height}` : '—'}
              </Meta>
              <Meta label="Tanggal foto">{formatDate(photo.taken_at)}</Meta>
              <Meta label="Model AI">{photo.tag_model || '—'}</Meta>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs uppercase tracking-wide text-gray-400">Status</span>
                <span className={`truncate text-sm font-medium ${statusColor}`}>{photo.tag_status}</span>
              </div>
              <Meta label="Folder" title={photo.folder_path}>
                {photo.folder || '—'}
              </Meta>
              </div>
            </div>

            {/* Camera & technical info */}
            {hasExif && (
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wide text-gray-400">
                  <Camera size={14} /> Info Kamera &amp; Teknis
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <Meta label="Kamera" title={cameraStr}>
                    {cameraStr || '—'}
                  </Meta>
                  <Meta label="Lensa" title={photo.lens_model}>
                    {photo.lens_model || '—'}
                  </Meta>
                  <Meta label="Aperture">{photo.aperture || '—'}</Meta>
                  <Meta label="Shutter">{photo.shutter_speed || '—'}</Meta>
                  <Meta label="ISO">{photo.iso || '—'}</Meta>
                  <Meta label="Focal Length">{photo.focal_length || '—'}</Meta>
                  <Meta label="Flash">{photo.flash || '—'}</Meta>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs uppercase tracking-wide text-gray-400">Lokasi GPS</span>
                    <span className="truncate text-sm font-medium" title={photo.gps_location}>
                      {photo.gps_location || '—'}
                      {photo.gps_lat && photo.gps_lng && (
                        <a
                          className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-brand-500 hover:underline"
                          href={`https://maps.google.com/?q=${photo.gps_lat},${photo.gps_lng}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink size={11} /> Buka Maps
                        </a>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Tags */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs uppercase tracking-wide text-gray-400">
                <Hash size={14} /> Tags
              </label>
              <div className="flex flex-wrap gap-1.5">
                {tagRows.length === 0 && <span className="text-xs text-gray-400">Belum ada tag.</span>}
                {tagRows.map((r) => (
                  <TagBadge
                    key={r.tag}
                    tag={r.tag}
                    source={r.source}
                    onClick={onSearchTag}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
              <form className="mt-3 flex gap-2" onSubmit={handleAdd}>
                <input
                  type="text"
                  placeholder="Tambah tag…"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  disabled={saving}
                  className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-navy-600 dark:bg-navy-900 dark:text-white"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500/10 px-3 py-2 text-sm font-medium text-brand-500 transition hover:bg-brand-500 hover:text-white disabled:opacity-50"
                  disabled={saving || !newTag.trim()}
                >
                  <Plus size={14} /> Tambah
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
