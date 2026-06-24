import { useEffect, useState, useCallback, useRef } from 'react'
import { Camera, AlertCircle } from 'lucide-react'
import { searchPhotos, getFolders, getStats, hasSupabaseConfig } from './lib/supabase'
import Scanner from './components/Scanner'
import SearchBar from './components/SearchBar'
import PhotoGrid from './components/PhotoGrid'
import PhotoModal from './components/PhotoModal'
import StatsBar from './components/StatsBar'

const PAGE_SIZE = 60

export default function App() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [folder, setFolder] = useState('all')

  const [photos, setPhotos] = useState([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)

  const [folders, setFolders] = useState([])
  const [stats, setStats] = useState(null)
  const [selected, setSelected] = useState(null)

  // Debounced query value.
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const debounceRef = useRef()
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 350)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  // Client-side filter (status + folder) on top of the server search.
  const applyFilters = useCallback(
    (rows) =>
      rows.filter((p) => {
        if (status !== 'all' && p.tag_status !== status) return false
        if (folder !== 'all' && p.folder !== folder) return false
        return true
      }),
    [status, folder],
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
  }, [debouncedQuery, status, folder])

  const refreshMeta = useCallback(async () => {
    if (!hasSupabaseConfig) return
    const [f, s] = await Promise.all([getFolders(), getStats()])
    setFolders(f)
    setStats(s)
  }, [])

  useEffect(() => {
    refreshMeta()
  }, [refreshMeta])

  const handleScanDone = useCallback(() => {
    setOffset(0)
    load(true)
    refreshMeta()
  }, [load, refreshMeta])

  const handleSearchTag = (tag) => {
    setSelected(null)
    setQuery(tag)
  }

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <Camera size={22} className="app__logo" />
          <h1>Photo Catalog</h1>
        </div>
        <StatsBar stats={stats} />
      </header>

      {!hasSupabaseConfig && (
        <div className="banner banner--error">
          <AlertCircle size={16} />
          Supabase belum dikonfigurasi. Salin <code>.env.example</code> ke <code>.env</code> dan isi{' '}
          <code>VITE_SUPABASE_URL</code> &amp; <code>VITE_SUPABASE_ANON_KEY</code>.
        </div>
      )}

      <main className="app__main">
        <Scanner onScanDone={handleScanDone} />

        <SearchBar
          value={query}
          onChange={setQuery}
          status={status}
          onStatusChange={setStatus}
          folder={folder}
          onFolderChange={setFolder}
          folders={folders}
        />

        <PhotoGrid
          photos={photos}
          loading={loading}
          hasMore={hasMore}
          onLoadMore={() => load(false)}
          onOpen={setSelected}
        />
      </main>

      <PhotoModal
        photo={selected}
        onClose={() => setSelected(null)}
        onSearchTag={handleSearchTag}
        onTagsChanged={refreshMeta}
      />
    </div>
  )
}
