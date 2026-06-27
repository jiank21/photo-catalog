import { useEffect, useState, useCallback, useRef } from 'react'
import {
  AlertCircle,
  LayoutGrid,
  Grid2x2,
  List,
  CheckSquare,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import {
  searchPhotos,
  getFolders,
  getStats,
  getSections,
  deletePhotos,
  hasSupabaseConfig,
} from './lib/supabase'
import { getUsageStats } from './lib/tagger'
import { cn } from './lib/cn'
import Sidebar from './components/Sidebar'
import Navbar from './components/Navbar'
import Scanner from './components/Scanner'
import QuotaBar from './components/QuotaBar'
import SearchBar from './components/SearchBar'
import PhotoGrid from './components/PhotoGrid'
import PhotoModal from './components/PhotoModal'
import StatsBar from './components/StatsBar'
import SettingsModal from './components/SettingsModal'
import HelpModal from './components/HelpModal'

const PAGE_SIZE = 60
const VIEW_KEY = 'photo-catalog-view'

const VIEW_OPTIONS = [
  { id: 'grid', icon: LayoutGrid, label: 'Grid' },
  { id: 'large', icon: Grid2x2, label: 'Large' },
  { id: 'list', icon: List, label: 'List' },
]

function ViewToggle({ view, onChange }) {
  return (
    <div
      className="inline-flex shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-navy-700"
      role="group"
      aria-label="Tampilan"
    >
      {VIEW_OPTIONS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          className={cn(
            'flex items-center px-3 py-2.5 transition-all duration-200',
            view === id
              ? 'bg-brand-500 text-white shadow-md'
              : 'text-gray-400 hover:text-brand-500 dark:hover:text-white',
          )}
          onClick={() => onChange(id)}
          title={label}
          aria-label={label}
          aria-pressed={view === id}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  )
}

// Master "select all" checkbox — native checkbox so we can show the
// indeterminate (partial) state, which is only settable via JS.
function SelectAllCheckbox({ checked, indeterminate, onChange }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <label
      className="flex cursor-pointer select-none items-center gap-2 border-r border-gray-200 pr-3 text-sm text-gray-500 dark:border-white/10 dark:text-gray-300"
      title="Pilih / batalkan semua yang tampil"
    >
      <input
        type="checkbox"
        ref={ref}
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 cursor-pointer accent-brand-500"
      />
      Semua
    </label>
  )
}

export default function App({ onLogout }) {
  const [query, setQuery] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [status, setStatus] = useState('all')
  const [folder, setFolder] = useState('all')
  const [activeSection, setActiveSection] = useState('all')
  const [activeFolderPath, setActiveFolderPath] = useState(null)

  const [view, setView] = useState(() => {
    if (typeof localStorage === 'undefined') return 'grid'
    return localStorage.getItem(VIEW_KEY) || 'grid'
  })
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch {
      /* ignore */
    }
  }, [view])

  const [photos, setPhotos] = useState([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)

  const [folders, setFolders] = useState([])
  const [sections, setSections] = useState([])
  const [stats, setStats] = useState(null)
  const [selected, setSelected] = useState(null)

  // Multi-select
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const scannerRef = useRef(null)

  // Debounced query value.
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const debounceRef = useRef()
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 350)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  // Client-side filter (status + folder + section + folder_path).
  const applyFilters = useCallback(
    (rows) =>
      rows.filter((p) => {
        if (status !== 'all' && p.tag_status !== status) return false
        if (folder !== 'all' && p.folder !== folder) return false
        if (activeSection !== 'all' && p.section_id !== activeSection) return false
        if (activeFolderPath && p.folder_path !== activeFolderPath) return false
        return true
      }),
    [status, folder, activeSection, activeFolderPath],
  )

  const load = useCallback(
    async (reset) => {
      if (!hasSupabaseConfig) return
      setLoading(true)
      const off = reset ? 0 : offset
      try {
        const rows = await searchPhotos({ query: debouncedQuery, limit: PAGE_SIZE, offset: off })
        const filtered = applyFilters(rows)
        setHasMore(rows.length === PAGE_SIZE)
        setOffset(off + PAGE_SIZE)
        setPhotos((prev) => (reset ? filtered : [...prev, ...filtered]))
      } catch (e) {
        console.error('search failed:', e.message)
      } finally {
        setLoading(false)
      }
    },
    [debouncedQuery, offset, applyFilters],
  )

  // Reload from the start whenever search/filter changes.
  useEffect(() => {
    setOffset(0)
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, status, folder, activeSection, activeFolderPath])

  const refreshMeta = useCallback(async () => {
    if (!hasSupabaseConfig) return
    const [f, s, sec] = await Promise.all([getFolders(), getStats(), getSections()])
    setFolders(f)
    setStats(s)
    setSections(sec)
  }, [])

  useEffect(() => {
    refreshMeta()
  }, [refreshMeta])

  const handleScanDone = useCallback(() => {
    setOffset(0)
    load(true)
    refreshMeta()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshMeta])

  const handleSearchTag = (tag) => {
    setSelected(null)
    setQuery(tag)
  }

  const handleScanToSection = (sectionId) => scannerRef.current?.scan(sectionId)
  const handleRetag = (opts) => scannerRef.current?.retag(opts)
  const handleRetagPhoto = async (photo) =>
    scannerRef.current?.retag({ scope: 'photo', value: photo, label: photo.filename })

  // Selecting a section clears any active folder filter.
  const handleSelectSection = (id) => {
    setActiveSection(id)
    setActiveFolderPath(null)
  }
  const handleSelectFolder = (folderPath) => {
    setActiveFolderPath((cur) => (cur === folderPath ? null : folderPath))
  }

  // ---------------- Multi-select handlers ----------------
  const toggleSelectMode = () => {
    setSelectMode((m) => {
      if (m) setSelectedIds(new Set()) // leaving select mode → clear
      return !m
    })
  }
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  // Master checkbox: select all visible, or deselect all (staying in select mode).
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const allSelected = photos.length > 0 && photos.every((p) => prev.has(p.id))
      return allSelected ? new Set() : new Set(photos.map((p) => p.id))
    })
  }
  const clearSelection = () => {
    setSelectedIds(new Set())
    setSelectMode(false)
  }

  const selectedPhotos = photos.filter((p) => selectedIds.has(p.id))

  const bulkRetag = async () => {
    if (!selectedPhotos.length) return
    setBulkBusy(true)
    try {
      await scannerRef.current?.retag({
        scope: 'photo',
        value: selectedPhotos,
        label: `${selectedPhotos.length} foto terpilih`,
      })
      clearSelection()
    } finally {
      setBulkBusy(false)
    }
  }

  const bulkDelete = async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    if (!window.confirm(`Hapus ${ids.length} foto dari katalog? Tindakan ini tidak bisa dibatalkan.`))
      return
    setBulkBusy(true)
    try {
      await deletePhotos(ids)
      clearSelection()
      setOffset(0)
      await load(true)
      await refreshMeta()
    } catch (e) {
      alert(`Gagal menghapus: ${e.message}`)
    } finally {
      setBulkBusy(false)
    }
  }

  const allSelected = photos.length > 0 && photos.every((p) => selectedIds.has(p.id))
  const someSelected = selectedIds.size > 0 && !allSelected

  // Breadcrumb pieces for the navbar.
  const activeSectionName =
    activeSection === 'all' ? null : sections.find((s) => s.id === activeSection)?.name || 'Section'
  const activeFolderName = activeFolderPath
    ? activeFolderPath.split('/').pop() || activeFolderPath
    : null

  return (
    <div className="flex h-screen overflow-hidden bg-[#F4F7FE] text-gray-900 dark:bg-navy-900 dark:text-white">
      <Sidebar
        sections={sections}
        activeSection={activeSection}
        activeFolderPath={activeFolderPath}
        onSelectSection={handleSelectSection}
        onSelectFolder={handleSelectFolder}
        onRefresh={refreshMeta}
        onScanToSection={handleScanToSection}
        onRetag={handleRetag}
        onOpenSettings={() => setShowSettings(true)}
        onOpenHelp={() => setShowHelp(true)}
      />

      <div className="ml-[280px] flex flex-1 flex-col overflow-hidden">
        <Navbar
          sectionName={activeSectionName}
          folderName={activeFolderName}
          query={query}
          onQueryChange={setQuery}
          onOpenSettings={() => setShowSettings(true)}
          onLogout={onLogout}
        />

        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
            {!hasSupabaseConfig && (
              <div className="flex items-center gap-2 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-500 dark:text-red-300">
                <AlertCircle size={16} />
                <span>
                  Supabase belum dikonfigurasi. Salin <code className="rounded bg-black/10 px-1 dark:bg-white/10">.env.example</code> ke{' '}
                  <code className="rounded bg-black/10 px-1 dark:bg-white/10">.env</code> dan isi{' '}
                  <code className="rounded bg-black/10 px-1 dark:bg-white/10">VITE_SUPABASE_URL</code> &amp;{' '}
                  <code className="rounded bg-black/10 px-1 dark:bg-white/10">VITE_SUPABASE_ANON_KEY</code>.
                </span>
              </div>
            )}

            <Scanner ref={scannerRef} sections={sections} onScanDone={handleScanDone} />

            <QuotaBar getStats={getUsageStats} />

            <StatsBar stats={stats} />

            <div className="flex flex-col items-start gap-3 sm:flex-row">
              <SearchBar
                value={query}
                onChange={setQuery}
                status={status}
                onStatusChange={setStatus}
                folder={folder}
                onFolderChange={setFolder}
                folders={folders}
              />
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200',
                  selectMode
                    ? 'border-transparent bg-brand-500 text-white shadow-md'
                    : 'border-gray-200 bg-white text-gray-600 shadow-sm hover:border-brand-300 dark:border-white/10 dark:bg-navy-700 dark:text-white/70 dark:hover:bg-navy-600',
                )}
                onClick={toggleSelectMode}
                title="Pilih beberapa foto untuk aksi massal"
              >
                <CheckSquare size={16} /> {selectMode ? 'Mode Pilih' : 'Pilih Foto'}
              </button>
              <ViewToggle view={view} onChange={setView} />
            </div>

            {activeFolderPath && (
              <div className="inline-flex max-w-full items-center gap-2 self-start rounded-xl bg-brand-500/10 px-3 py-1.5 text-xs text-brand-500">
                Folder: <b className="truncate">{activeFolderPath}</b>
                <button
                  type="button"
                  onClick={() => setActiveFolderPath(null)}
                  aria-label="Hapus filter"
                  className="opacity-80 transition hover:opacity-100"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            <PhotoGrid
              photos={photos}
              loading={loading}
              hasMore={hasMore}
              onLoadMore={() => load(false)}
              onOpen={setSelected}
              view={view}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              sections={sections}
              activeSection={activeSection}
              activeFolderPath={activeFolderPath}
            />
          </div>
        </main>
      </div>

      {/* Floating select toolbar */}
      {selectMode && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white/90 px-6 py-3 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-navy-800/90">
          <SelectAllCheckbox checked={allSelected} indeterminate={someSelected} onChange={toggleSelectAll} />
          <span className="text-sm font-semibold tabular-nums">{selectedIds.size} foto dipilih</span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500/10 px-3 py-2 text-sm font-medium text-brand-500 transition-all duration-200 hover:bg-brand-500 hover:text-white disabled:opacity-50"
            onClick={bulkRetag}
            disabled={bulkBusy || selectedIds.size === 0}
          >
            <RefreshCw size={14} /> Re-tag
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/10 px-3 py-2 text-sm font-medium text-red-500 transition-all duration-200 hover:bg-red-500 hover:text-white disabled:opacity-50"
            onClick={bulkDelete}
            disabled={bulkBusy || selectedIds.size === 0}
            title="Hapus foto dari katalog (file asli tidak dihapus)"
          >
            <Trash2 size={14} /> Hapus
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-gray-400 transition-all duration-200 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-navy-700 dark:hover:text-white"
            onClick={clearSelection}
          >
            <X size={14} /> Cancel
          </button>
        </div>
      )}

      <PhotoModal
        photo={selected}
        onClose={() => setSelected(null)}
        onSearchTag={handleSearchTag}
        onTagsChanged={refreshMeta}
        onRetagPhoto={handleRetagPhoto}
      />

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onLogout={onLogout} />}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  )
}
