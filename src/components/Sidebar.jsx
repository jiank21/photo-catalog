import { useState } from 'react'
import {
  Camera,
  FolderPlus,
  FolderInput,
  Pencil,
  Trash2,
  Sparkles,
  Wand2,
  ChevronRight,
  Folder,
  Settings2,
  BookOpen,
} from 'lucide-react'
import { createSection, renameSection, deleteSection, deleteFolder } from '../lib/supabase'
import { cn } from '../lib/cn'

function shortFolder(path) {
  if (!path) return '—'
  const parts = path.split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : path
}

const navItemBase =
  'flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-all duration-200'

export default function Sidebar({
  sections = [],
  activeSection = 'all',
  activeFolderPath = null,
  onSelectSection,
  onSelectFolder,
  onRefresh,
  onScanToSection,
  onRetag,
  onOpenSettings,
  onOpenHelp,
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
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-[280px] flex-col border-r border-gray-200 bg-white shadow-lg dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-purple-500 text-white shadow-md">
          <Camera size={22} />
        </span>
        <div className="min-w-0">
          <h1 className="bg-gradient-to-r from-brand-500 to-purple-500 bg-clip-text text-lg font-bold leading-tight text-transparent">
            Photo Catalog
          </h1>
          <p className="text-xs text-gray-400">AI-Powered</p>
        </div>
      </div>

      <div className="mb-2 mt-1 border-t border-gray-200 dark:border-white/10" />

      {/* Scrollable sections list */}
      <div className="flex-1 overflow-y-auto px-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-white/40">
            Sections
          </span>
          <button
            type="button"
            onClick={handleNewSection}
            title="Buat section baru"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-all duration-200 hover:bg-brand-500/10 hover:text-brand-500"
          >
            <FolderPlus size={16} />
          </button>
        </div>

        {/* All photos */}
        <button
          type="button"
          className={cn(
            navItemBase,
            activeSection === 'all'
              ? 'bg-brand-500 text-white shadow-lg'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white',
          )}
          onClick={() => onSelectSection?.('all')}
        >
          <Folder size={16} className="shrink-0" />
          <span className="flex-1 truncate text-left">Semua foto</span>
        </button>

        {sections.length === 0 && (
          <p className="px-2 py-3 text-xs text-gray-400">
            Belum ada section. Buat satu lalu scan folder ke dalamnya.
          </p>
        )}

        <div className="mt-1 flex flex-col gap-1">
          {sections.map((s) => {
            const open = !!expanded[s.id]
            const isActive = activeSection === s.id
            return (
              <div key={s.id}>
                <div
                  className={cn(
                    'flex items-center rounded-xl transition-all duration-200',
                    isActive ? 'bg-brand-500 text-white shadow-lg' : 'hover:bg-gray-100 dark:hover:bg-white/10',
                  )}
                >
                  <button
                    type="button"
                    className={cn(
                      'flex items-center py-2.5 pl-2 pr-1',
                      isActive ? 'text-white/80' : 'text-gray-400',
                    )}
                    onClick={() => toggle(s.id)}
                    aria-label="Expand"
                  >
                    <ChevronRight
                      size={14}
                      className={cn('transition-transform duration-200', open && 'rotate-90')}
                    />
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-2 py-2.5 pr-2 text-sm',
                      isActive ? 'text-white' : 'text-gray-600 dark:text-white/70',
                    )}
                    onClick={() => onSelectSection?.(s.id)}
                  >
                    <Folder
                      size={16}
                      className="shrink-0"
                      style={isActive ? undefined : { color: s.color || '#6172F3' }}
                    />
                    <span className="flex-1 truncate text-left" title={s.name}>
                      {s.name}
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs tabular-nums',
                        isActive ? 'bg-white/20 text-white' : 'bg-brand-500/10 text-brand-500',
                      )}
                    >
                      {s.photo_count}
                    </span>
                  </button>
                </div>

                {open && (
                  <div className="mb-1 mt-1 pl-4">
                    {s.description && (
                      <p className="mb-2 text-xs text-gray-400">{s.description}</p>
                    )}

                    <div className="mb-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 transition hover:bg-brand-500/10 hover:text-brand-500 dark:bg-navy-700 dark:text-white/70"
                        onClick={() => onScanToSection?.(s.id)}
                      >
                        <FolderInput size={12} /> Folder
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 transition hover:bg-brand-500/10 hover:text-brand-500 dark:bg-navy-700 dark:text-white/70"
                        onClick={() =>
                          onRetag?.({ scope: 'section', value: s.id, label: `Section: ${s.name}` })
                        }
                      >
                        <Wand2 size={12} /> Re-tag
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 transition hover:bg-brand-500/10 hover:text-brand-500 dark:bg-navy-700 dark:text-white/70"
                        onClick={() => handleRename(s)}
                      >
                        <Pencil size={12} /> Rename
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 transition hover:bg-red-500/10 hover:text-red-500 dark:bg-navy-700 dark:text-white/70"
                        onClick={() => handleDeleteSection(s)}
                      >
                        <Trash2 size={12} /> Hapus
                      </button>
                    </div>

                    {s.folders.length === 0 ? (
                      <p className="text-xs text-gray-400">Belum ada folder.</p>
                    ) : (
                      <ul className="flex flex-col gap-0.5">
                        {s.folders.map((f) => {
                          const folderActive = activeFolderPath === f.folder_path
                          return (
                            <li
                              key={f.folder_path}
                              className={cn(
                                'group flex items-center justify-between gap-1 rounded-lg px-2 py-1.5 transition-all duration-200',
                                folderActive
                                  ? 'bg-brand-500/10'
                                  : 'hover:bg-gray-100 dark:hover:bg-white/5',
                              )}
                            >
                              <button
                                type="button"
                                className={cn(
                                  'flex min-w-0 flex-1 items-center gap-1.5 truncate text-left text-xs',
                                  folderActive
                                    ? 'text-brand-500'
                                    : 'text-gray-500 hover:text-gray-700 dark:text-white/60 dark:hover:text-white',
                                )}
                                title={`Filter foto di ${f.folder_path}`}
                                onClick={() => onSelectFolder?.(f.folder_path)}
                              >
                                <Folder size={12} className="shrink-0" />
                                <span className="truncate">{shortFolder(f.folder_path)}</span>
                                <span className="rounded-full bg-gray-200 px-1.5 text-[10px] tabular-nums text-gray-500 dark:bg-navy-600 dark:text-white/70">
                                  {f.count}
                                </span>
                              </button>
                              <span className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                                <button
                                  type="button"
                                  className="rounded p-1 text-gray-400 transition hover:bg-gray-200 hover:text-brand-500 dark:hover:bg-navy-600"
                                  title="Re-tag folder ini"
                                  onClick={() =>
                                    onRetag?.({
                                      scope: 'folder',
                                      value: f.folder_path,
                                      label: `Folder: ${shortFolder(f.folder_path)}`,
                                    })
                                  }
                                >
                                  <Wand2 size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="rounded p-1 text-gray-400 transition hover:bg-gray-200 hover:text-red-500 dark:hover:bg-navy-600"
                                  title="Hapus folder dari katalog"
                                  onClick={() => handleDeleteFolder(f)}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer actions */}
      <div className="mt-auto border-t border-gray-200 px-4 py-4 dark:border-white/10">
        <button
          type="button"
          className={cn(navItemBase, 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white')}
          onClick={() => onRetag?.({ scope: 'all', label: 'Semua foto' })}
          title="Re-tag semua foto di katalog"
        >
          <Sparkles size={16} /> Re-tag Semua
        </button>
        <button
          type="button"
          className={cn(navItemBase, 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white')}
          onClick={onOpenSettings}
        >
          <Settings2 size={16} /> Pengaturan
        </button>
        <button
          type="button"
          className={cn(navItemBase, 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white')}
          onClick={onOpenHelp}
        >
          <BookOpen size={16} /> Bantuan
        </button>
      </div>
    </aside>
  )
}
