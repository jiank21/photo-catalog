import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Camera,
  AlertCircle,
  LayoutGrid,
  Grid2x2,
  List,
  CheckSquare,
  RefreshCw,
  Trash2,
  X,
  HelpCircle,
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
import Scanner from './components/Scanner'
import QuotaBar from './components/QuotaBar'
import SearchBar from './components/SearchBar'
import PhotoGrid from './components/PhotoGrid'
import PhotoModal from './components/PhotoModal'
import StatsBar from './components/StatsBar'
import SectionManager from './components/SectionManager'
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
    <div className="view-toggle" role="group" aria-label="Tampilan">
      {VIEW_OPTIONS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          className={`view-toggle__btn${view === id ? ' is-active' : ''}`}
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
    <label className="master-check" title="Pilih / batalkan semua yang tampil">
      <input type="checkbox" ref={ref} checked={checked} onChange={onChange} />
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

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <Camera size={22} className="app__logo" />
          <h1>Photo Catalog</h1>
        </div>
        <StatsBar stats={stats} />
        <button
          type="button"
          className="help-btn"
          onClick={() => setShowHelp(true)}
          title="Panduan & FAQ"
          aria-label="Bantuan"
        >
          <HelpCircle size={20} />
        </button>
      </header>

      {!hasSupabaseConfig && (
        <div className="banner banner--error">
          <AlertCircle size={16} />
          Supabase belum dikonfigurasi. Salin <code>.env.example</code> ke <code>.env</code> dan isi{' '}
          <code>VITE_SUPABASE_URL</code> &amp; <code>VITE_SUPABASE_ANON_KEY</code>.
        </div>
      )}

      <div className="app__body">
        <SectionManager
          sections={sections}
          activeSection={activeSection}
          activeFolderPath={activeFolderPath}
          onSelectSection={handleSelectSection}
          onSelectFolder={handleSelectFolder}
          onRefresh={refreshMeta}
          onScanToSection={handleScanToSection}
          onRetag={handleRetag}
          onOpenSettings={() => setShowSettings(true)}
        />

        <main className="app__main">
          <Scanner ref={scannerRef} sections={sections} onScanDone={handleScanDone} />

          <QuotaBar getStats={getUsageStats} />

          <div className="search-row">
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
              className={`btn${selectMode ? ' btn--primary' : ''}`}
              onClick={toggleSelectMode}
              title="Pilih beberapa foto untuk aksi massal"
            >
              <CheckSquare size={16} /> {selectMode ? 'Mode Pilih' : 'Pilih Foto'}
            </button>
            <ViewToggle view={view} onChange={setView} />
          </div>

          {activeFolderPath && (
            <div className="filter-chip">
              Folder: <b>{activeFolderPath}</b>
              <button type="button" onClick={() => setActiveFolderPath(null)} aria-label="Hapus filter">
                <X size={13} />
              </button>
            </div>
          )}

          {selectMode && (
            <div className="select-toolbar">
              <SelectAllCheckbox
                checked={photos.length > 0 && photos.every((p) => selectedIds.has(p.id))}
                indeterminate={
                  selectedIds.size > 0 && !photos.every((p) => selectedIds.has(p.id))
                }
                onChange={toggleSelectAll}
              />
              <span className="select-toolbar__count">{selectedIds.size} foto dipilih</span>
              <button
                type="button"
                className="btn btn--small"
                onClick={bulkRetag}
                disabled={bulkBusy || selectedIds.size === 0}
              >
                <RefreshCw size={14} /> Re-tag Terpilih
              </button>
              <button
                type="button"
                className="btn btn--small btn--danger"
                onClick={bulkDelete}
                disabled={bulkBusy || selectedIds.size === 0}
                title="Hapus foto dari katalog (file asli tidak dihapus)"
              >
                <Trash2 size={14} /> Hapus Entry
              </button>
              <button type="button" className="btn btn--small" onClick={clearSelection}>
                <X size={14} /> Cancel
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
        </main>
      </div>

      <PhotoModal
        photo={selected}
        onClose={() => setSelected(null)}
        onSearchTag={handleSearchTag}
        onTagsChanged={refreshMeta}
        onRetagPhoto={handleRetagPhoto}
      />

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} onLogout={onLogout} />
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  )
}
