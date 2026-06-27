import { Image as ImageIcon, Check, Minus, Folder } from 'lucide-react'
import { cn } from '../lib/cn'

const STATUS_STYLES = {
  tagged: 'bg-emerald-500/20 text-emerald-500',
  pending: 'bg-amber-500/20 text-amber-500',
  failed: 'bg-red-500/20 text-red-500',
  skipped: 'bg-gray-400/20 text-gray-400',
}

function StatusBadge({ status, inline }) {
  const s = status || 'pending'
  return (
    <span
      className={cn(
        'rounded-md px-2 py-0.5 text-[10px] font-semibold lowercase backdrop-blur-sm',
        !inline && 'absolute right-2 top-2',
        STATUS_STYLES[s] || STATUS_STYLES.pending,
      )}
    >
      {s}
    </span>
  )
}

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
    return new Date(d).toLocaleDateString()
  } catch {
    return '—'
  }
}

function SelectBox({ selected }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition',
        selected
          ? 'border-brand-500 bg-brand-500 text-white'
          : 'border-gray-300 bg-white/80 text-transparent dark:border-white/30 dark:bg-navy-900',
      )}
    >
      {selected && <Check size={13} strokeWidth={3} />}
    </span>
  )
}

function findSectionForFolder(sections, folderPath) {
  for (const s of sections) {
    if (s.folders?.some((f) => f.folder_path === folderPath)) return s
  }
  return null
}

const tagPill =
  'rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-500 whitespace-nowrap'

// Card container: identical box model for every card so the grid stays uniform.
const cardShell =
  'group flex w-full flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-200 dark:bg-navy-700'

function PhotoCard({ photo, onActivate, selectMode, selected, infoMinH }) {
  const tags = photo.tags || []
  return (
    <button
      type="button"
      className={cn(
        cardShell,
        selected
          ? 'border-brand-500 ring-2 ring-brand-500 dark:border-brand-500'
          : 'border-gray-200 hover:border-brand-300 hover:shadow-md dark:border-white/10 dark:hover:bg-navy-600',
      )}
      onClick={() => onActivate(photo)}
    >
      {selectMode && (
        <div className="flex items-center px-3 pt-3">
          <SelectBox selected={selected} />
        </div>
      )}
      {/* aspect-square keeps every thumbnail the exact same size */}
      <div className="relative aspect-square w-full bg-gray-100 dark:bg-navy-900">
        {photo.thumbnail_base64 ? (
          <img
            src={photo.thumbnail_base64}
            alt={photo.filename}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400 dark:text-white/40">
            <ImageIcon size={28} />
          </div>
        )}
        <StatusBadge status={photo.tag_status} />
      </div>
      <div className={cn('flex flex-col justify-between p-3', infoMinH)}>
        <div>
          <div className="truncate text-sm font-semibold text-gray-900 dark:text-white" title={photo.filename}>
            {photo.filename}
          </div>
          <div
            className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500 dark:text-white/60"
            title={photo.folder_path}
          >
            <Folder size={11} className="shrink-0" /> {photo.folder || '—'}
          </div>
        </div>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.slice(0, 4).map((t) => (
              <span key={t} className={tagPill}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

function PhotoRow({ photo, onActivate, selectMode, selected }) {
  const tags = photo.tags || []
  return (
    <button
      type="button"
      className={cn(
        'grid w-full items-center gap-3 border-b px-4 py-2.5 text-left transition-colors duration-150 last:border-b-0',
        selectMode
          ? 'grid-cols-[32px_60px_2fr_2fr_100px_80px_2fr_90px]'
          : 'grid-cols-[60px_2fr_2fr_100px_80px_2fr_90px]',
        selected
          ? 'border-gray-100 bg-brand-500/10 dark:border-white/10'
          : 'border-gray-100 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-navy-700/50',
      )}
      onClick={() => onActivate(photo)}
    >
      {selectMode && (
        <div className="flex items-center justify-center">
          <SelectBox selected={selected} />
        </div>
      )}
      <div className="h-[60px] w-[60px] overflow-hidden rounded-lg bg-gray-100 dark:bg-navy-900">
        {photo.thumbnail_base64 ? (
          <img src={photo.thumbnail_base64} alt={photo.filename} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400 dark:text-white/40">
            <ImageIcon size={18} />
          </div>
        )}
      </div>
      <div className="truncate font-medium text-gray-900 dark:text-white" title={photo.filename}>
        {photo.filename}
      </div>
      <div className="truncate text-xs text-gray-500 dark:text-white/60" title={photo.folder_path}>
        {photo.folder_path || photo.folder || '—'}
      </div>
      <div className="truncate text-xs text-gray-500 dark:text-white/50">{formatDate(photo.taken_at)}</div>
      <div className="truncate text-xs text-gray-500 dark:text-white/50">{formatBytes(photo.file_size)}</div>
      <div className="flex flex-wrap gap-1 overflow-hidden">
        {tags.slice(0, 3).map((t) => (
          <span key={t} className={tagPill}>
            {t}
          </span>
        ))}
      </div>
      <div>
        <StatusBadge status={photo.tag_status} inline />
      </div>
    </button>
  )
}

function MasterCheckbox({ allSelected, someSelected, onToggle }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center rounded-md border-2 transition',
        allSelected || someSelected
          ? 'border-brand-500 bg-brand-500 text-white'
          : 'border-gray-300 dark:border-white/30',
      )}
      onClick={onToggle}
      aria-label="Pilih / batalkan semua"
      title="Pilih / batalkan semua yang tampil"
    >
      {allSelected ? (
        <Check size={13} strokeWidth={3} />
      ) : someSelected ? (
        <Minus size={13} strokeWidth={3} />
      ) : null}
    </button>
  )
}

export default function PhotoGrid({
  photos,
  onOpen,
  loading,
  hasMore,
  onLoadMore,
  view = 'grid',
  selectMode = false,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  sections = [],
  activeSection = 'all',
  activeFolderPath = null,
}) {
  if (!loading && photos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 py-20 text-center text-gray-400 dark:border-white/10 dark:text-white/40">
        <ImageIcon size={40} />
        <p>Belum ada foto. Scan folder dulu untuk mengisi katalog.</p>
      </div>
    )
  }

  const isList = view === 'list'
  const large = view === 'large'
  const activate = (photo) => (selectMode ? onToggleSelect?.(photo.id) : onOpen(photo))
  const isSelected = (id) => !!selectedIds && selectedIds.has(id)

  const allSelected = photos.length > 0 && photos.every((p) => isSelected(p.id))
  const someSelected = photos.some((p) => isSelected(p.id))

  // ---- Title above the grid ----
  let titleIcon = '🗂'
  let titleLabel = 'Semua Foto'
  if (activeFolderPath) {
    titleIcon = '📁'
    const sec = findSectionForFolder(sections, activeFolderPath)
    const folderName = activeFolderPath.split('/').pop() || activeFolderPath
    titleLabel = `${sec ? sec.name : 'Tanpa Section'} / ${folderName}`
  } else if (activeSection !== 'all') {
    titleIcon = '📁'
    const sec = sections.find((s) => s.id === activeSection)
    titleLabel = sec ? sec.name : 'Section'
  }

  const titleBar = (
    <div className="flex items-baseline justify-between gap-3">
      <span className="truncate text-base font-semibold text-gray-900 dark:text-white" title={titleLabel}>
        {titleIcon} {titleLabel}
      </span>
      <span className="shrink-0 text-sm tabular-nums text-gray-500 dark:text-white/50">
        {photos.length} foto{loading ? '…' : ''}
      </span>
    </div>
  )

  // ---- Group by section only when showing everything in a card view ----
  const grouping = !isList && activeSection === 'all' && !activeFolderPath

  const buildGroups = () => {
    const map = new Map()
    for (const p of photos) {
      const key = p.section_id || '__none__'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(p)
    }
    const groups = []
    for (const s of sections) {
      if (map.has(s.id)) {
        groups.push({ id: s.id, name: s.name, color: s.color, photos: map.get(s.id) })
        map.delete(s.id)
      }
    }
    for (const [key, ph] of map) {
      if (key === '__none__') continue
      groups.push({ id: key, name: 'Section', color: null, photos: ph })
    }
    if (map.has('__none__')) {
      groups.push({ id: '__none__', name: 'Tanpa Section', color: null, photos: map.get('__none__') })
    }
    return groups
  }

  // Fixed responsive columns → every card shares the same width (no auto-fill jitter).
  const gridClass = large
    ? 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4'
    : 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
  const infoMinH = large ? 'min-h-[100px]' : 'min-h-[90px]'

  const renderCard = (p) => (
    <PhotoCard
      key={p.id}
      photo={p}
      onActivate={activate}
      selectMode={selectMode}
      selected={isSelected(p.id)}
      infoMinH={infoMinH}
    />
  )

  const footer = (
    <>
      {loading && <div className="py-6 text-center text-gray-500 dark:text-white/50">Memuat…</div>}
      {!loading && hasMore && (
        <div className="flex justify-center py-3">
          <button
            type="button"
            className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 shadow-sm transition hover:border-brand-300 hover:text-brand-500 dark:border-white/10 dark:bg-navy-700 dark:text-white/70 dark:hover:bg-navy-600 dark:hover:text-white"
            onClick={onLoadMore}
          >
            Muat lebih banyak
          </button>
        </div>
      )}
    </>
  )

  if (isList) {
    return (
      <div className="flex flex-col gap-4">
        {titleBar}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-navy-700">
          <div
            className={cn(
              'grid items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:border-white/10 dark:bg-navy-900 dark:text-white/50',
              selectMode
                ? 'grid-cols-[32px_60px_2fr_2fr_100px_80px_2fr_90px]'
                : 'grid-cols-[60px_2fr_2fr_100px_80px_2fr_90px]',
            )}
          >
            {selectMode && (
              <span className="flex items-center justify-center">
                <MasterCheckbox allSelected={allSelected} someSelected={someSelected} onToggle={onToggleSelectAll} />
              </span>
            )}
            <span />
            <span>Nama file</span>
            <span>Folder</span>
            <span>Tanggal</span>
            <span>Ukuran</span>
            <span>Tags</span>
            <span>Status</span>
          </div>
          {photos.map((p) => (
            <PhotoRow
              key={p.id}
              photo={p}
              onActivate={activate}
              selectMode={selectMode}
              selected={isSelected(p.id)}
            />
          ))}
        </div>
        {footer}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {titleBar}
      {grouping ? (
        <div className="flex flex-col gap-6">
          {buildGroups().map((g) => (
            <div key={g.id} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 text-sm font-semibold text-gray-600 dark:border-white/10 dark:bg-navy-900/30 dark:text-white/70">
                {g.color && (
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                )}
                📁 {g.name} — {g.photos.length} foto
              </div>
              <div className={gridClass}>{g.photos.map(renderCard)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className={gridClass}>{photos.map(renderCard)}</div>
      )}
      {footer}
    </div>
  )
}
