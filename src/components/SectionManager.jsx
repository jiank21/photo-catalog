import { useState } from 'react'
import {
  Plus,
  FolderPlus,
  Pencil,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Layers,
  Folder,
} from 'lucide-react'
import { createSection, renameSection, deleteSection, deleteFolder } from '../lib/supabase'

function shortFolder(path) {
  if (!path) return '—'
  const parts = path.split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : path
}

export default function SectionManager({
  sections = [],
  activeSection = 'all',
  onSelectSection,
  onRefresh,
  onScanToSection,
  onRetag,
}) {
  const [expanded, setExpanded] = useState({})

  const toggle = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }))

  const handleNewSection = async () => {
    const name = window.prompt('Nama section baru:')
    if (!name || !name.trim()) return
    try {
      await createSection({ name: name.trim() })
      onRefresh?.()
    } catch (e) {
      alert(`Gagal membuat section: ${e.message}`)
    }
  }

  const handleRename = async (section) => {
    const name = window.prompt('Nama baru untuk section:', section.name)
    if (!name || !name.trim() || name.trim() === section.name) return
    try {
      await renameSection(section.id, name.trim())
      onRefresh?.()
    } catch (e) {
      alert(`Gagal rename: ${e.message}`)
    }
  }

  const handleDeleteSection = async (section) => {
    if (
      !window.confirm(
        `Hapus section "${section.name}"? Foto-fotonya tetap ada di katalog, hanya dilepas dari section ini.`,
      )
    )
      return
    try {
      await deleteSection(section.id)
      onRefresh?.()
    } catch (e) {
      alert(`Gagal hapus section: ${e.message}`)
    }
  }

  const handleDeleteFolder = async (folder) => {
    if (
      !window.confirm(
        `Hapus folder "${folder.folder_path}" dari katalog? Semua foto (${folder.count}) di folder ini akan dihapus dari database.`,
      )
    )
      return
    try {
      await deleteFolder(folder.folder_path)
      onRefresh?.()
    } catch (e) {
      alert(`Gagal hapus folder: ${e.message}`)
    }
  }

  return (
    <aside className="sections">
      <div className="sections__head">
        <span className="sections__title">
          <Layers size={15} /> Sections
        </span>
      </div>

      <div className="sections__global">
        <button type="button" className="btn btn--small" onClick={handleNewSection}>
          <Plus size={14} /> Section Baru
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => onRetag?.({ scope: 'all', label: 'Semua foto' })}
          title="Re-tag semua foto di katalog"
        >
          <RefreshCw size={14} /> Re-tag Semua
        </button>
      </div>

      <button
        type="button"
        className={`section-item section-item--all${activeSection === 'all' ? ' is-active' : ''}`}
        onClick={() => onSelectSection?.('all')}
      >
        <span className="section-item__dot" style={{ background: 'var(--muted)' }} />
        <span className="section-item__name">Semua foto</span>
      </button>

      {sections.length === 0 && (
        <p className="hint" style={{ padding: '8px 4px' }}>
          Belum ada section. Buat satu lalu scan folder ke dalamnya.
        </p>
      )}

      {sections.map((s) => {
        const open = !!expanded[s.id]
        return (
          <div key={s.id} className="section-block">
            <div className={`section-item${activeSection === s.id ? ' is-active' : ''}`}>
              <button
                type="button"
                className="section-item__caret"
                onClick={() => toggle(s.id)}
                aria-label="Expand"
              >
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <button
                type="button"
                className="section-item__main"
                onClick={() => onSelectSection?.(s.id)}
              >
                <span className="section-item__dot" style={{ background: s.color || '#6c8ef5' }} />
                <span className="section-item__name" title={s.name}>
                  {s.name}
                </span>
                <span className="section-item__count">{s.photo_count}</span>
              </button>
            </div>

            {open && (
              <div className="section-detail">
                {s.description && <p className="section-detail__desc">{s.description}</p>}

                <div className="section-detail__actions">
                  <button
                    type="button"
                    className="btn btn--tiny"
                    onClick={() => onScanToSection?.(s.id)}
                  >
                    <FolderPlus size={12} /> Tambah Folder
                  </button>
                  <button
                    type="button"
                    className="btn btn--tiny"
                    onClick={() =>
                      onRetag?.({ scope: 'section', value: s.id, label: `Section: ${s.name}` })
                    }
                  >
                    <RefreshCw size={12} /> Re-tag
                  </button>
                  <button type="button" className="btn btn--tiny" onClick={() => handleRename(s)}>
                    <Pencil size={12} /> Rename
                  </button>
                  <button
                    type="button"
                    className="btn btn--tiny btn--danger"
                    onClick={() => handleDeleteSection(s)}
                  >
                    <Trash2 size={12} /> Hapus
                  </button>
                </div>

                {s.folders.length === 0 ? (
                  <p className="hint" style={{ margin: '6px 0 0' }}>
                    Belum ada folder.
                  </p>
                ) : (
                  <ul className="folder-list">
                    {s.folders.map((f) => (
                      <li key={f.folder_path} className="folder-list__item">
                        <span className="folder-list__name" title={f.folder_path}>
                          <Folder size={12} /> {shortFolder(f.folder_path)}
                          <span className="folder-list__count">{f.count}</span>
                        </span>
                        <span className="folder-list__actions">
                          <button
                            type="button"
                            className="icon-btn"
                            title="Re-tag folder ini"
                            onClick={() =>
                              onRetag?.({
                                scope: 'folder',
                                value: f.folder_path,
                                label: `Folder: ${shortFolder(f.folder_path)}`,
                              })
                            }
                          >
                            <RefreshCw size={13} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn icon-btn--danger"
                            title="Hapus folder dari katalog"
                            onClick={() => handleDeleteFolder(f)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )
      })}
    </aside>
  )
}
