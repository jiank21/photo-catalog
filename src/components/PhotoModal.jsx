import { useEffect, useState, useCallback } from 'react'
import { X, Copy, Check, Plus, FolderInput, RefreshCw } from 'lucide-react'
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Tutup">
          <X size={20} />
        </button>

        <div className="modal__grid">
          <div className="modal__preview">
            {photo.thumbnail_base64 ? (
              <img src={photo.thumbnail_base64} alt={photo.filename} />
            ) : (
              <div className="modal__noimg">Tidak ada thumbnail (RAW / skipped)</div>
            )}
          </div>

          <div className="modal__info">
            <div className="modal__titlerow">
              <h2 className="modal__title">{photo.filename}</h2>
              {onRetagPhoto && photo.thumbnail_base64 && (
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={handleRetag}
                  disabled={retagging}
                  title="Jalankan AI tagging ulang untuk foto ini"
                >
                  <RefreshCw size={14} className={retagging ? 'spin' : undefined} />
                  {retagging ? 'Re-tagging…' : 'Re-tag foto ini'}
                </button>
              )}
            </div>

            {/* Filepath + copy */}
            <div className="field">
              <label>Path lengkap</label>
              <div className="path-row">
                <code className="path-row__path">{photo.filepath}</code>
                <button type="button" className="btn btn--small" onClick={copyPath}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Tersalin' : 'Copy'}
                </button>
              </div>
              <p className="hint">
                <FolderInput size={13} /> Buka File Explorer → paste path di address bar.
              </p>
            </div>

            {/* Metadata */}
            <div className="meta-grid">
              <div>
                <span className="meta-grid__k">Ukuran</span>
                <span className="meta-grid__v">{formatBytes(photo.file_size)}</span>
              </div>
              <div>
                <span className="meta-grid__k">Resolusi</span>
                <span className="meta-grid__v">
                  {photo.width && photo.height ? `${photo.width}×${photo.height}` : '—'}
                </span>
              </div>
              <div>
                <span className="meta-grid__k">Tanggal foto</span>
                <span className="meta-grid__v">{formatDate(photo.taken_at)}</span>
              </div>
              <div>
                <span className="meta-grid__k">Model AI</span>
                <span className="meta-grid__v">{photo.tag_model || '—'}</span>
              </div>
              <div>
                <span className="meta-grid__k">Status</span>
                <span className={`meta-grid__v status-text status-text--${photo.tag_status}`}>
                  {photo.tag_status}
                </span>
              </div>
              <div>
                <span className="meta-grid__k">Folder</span>
                <span className="meta-grid__v" title={photo.folder_path}>
                  {photo.folder || '—'}
                </span>
              </div>
            </div>

            {/* Tags */}
            <div className="field">
              <label>Tags</label>
              <div className="tag-list">
                {tagRows.length === 0 && <span className="hint">Belum ada tag.</span>}
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
              <form className="add-tag" onSubmit={handleAdd}>
                <input
                  type="text"
                  placeholder="Tambah tag…"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  disabled={saving}
                />
                <button type="submit" className="btn btn--small" disabled={saving || !newTag.trim()}>
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
