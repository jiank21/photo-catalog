import { Image as ImageIcon, Check, Minus } from 'lucide-react'

const STATUS_LABELS = {
  tagged: 'tagged',
  pending: 'pending',
  failed: 'failed',
  skipped: 'skipped',
}

function StatusBadge({ status, inline }) {
  return (
    <span
      className={`status-badge${inline ? ' status-badge--inline' : ''} status-badge--${status || 'pending'}`}
    >
      {STATUS_LABELS[status] || status || 'pending'}
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
    <span className={`select-box${selected ? ' is-checked' : ''}`}>
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

function PhotoCard({ photo, onActivate, selectMode, selected }) {
  const tags = photo.tags || []
  return (
    <button
      type="button"
      className={`photo-card${selected ? ' is-selected' : ''}`}
      onClick={() => onActivate(photo)}
    >
      {selectMode && (
        <div className="photo-card__checkbar">
          <SelectBox selected={selected} />
        </div>
      )}
      <div className="photo-card__thumb">
        {photo.thumbnail_base64 ? (
          <img src={photo.thumbnail_base64} alt={photo.filename} loading="lazy" />
        ) : (
          <div className="photo-card__placeholder">
            <ImageIcon size={28} />
          </div>
        )}
        <StatusBadge status={photo.tag_status} />
      </div>
      <div className="photo-card__body">
        <div className="photo-card__name" title={photo.filename}>
          {photo.filename}
        </div>
        <div className="photo-card__folder" title={photo.folder_path}>
          {photo.folder || '—'}
        </div>
        {tags.length > 0 && (
          <div className="photo-card__tags">
            {tags.slice(0, 4).map((t) => (
              <span key={t} className="photo-card__tag">
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
      className={`photo-row${selected ? ' is-selected' : ''}`}
      onClick={() => onActivate(photo)}
    >
      {selectMode && (
        <div className="photo-row__check">
          <SelectBox selected={selected} />
        </div>
      )}
      <div className="photo-row__thumb">
        {photo.thumbnail_base64 ? (
          <img src={photo.thumbnail_base64} alt={photo.filename} loading="lazy" />
        ) : (
          <div className="photo-card__placeholder">
            <ImageIcon size={18} />
          </div>
        )}
      </div>
      <div className="photo-row__name" title={photo.filename}>
        {photo.filename}
      </div>
      <div className="photo-row__folder" title={photo.folder_path}>
        {photo.folder_path || photo.folder || '—'}
      </div>
      <div className="photo-row__date">{formatDate(photo.taken_at)}</div>
      <div className="photo-row__size">{formatBytes(photo.file_size)}</div>
      <div className="photo-row__tags">
        {tags.slice(0, 3).map((t) => (
          <span key={t} className="photo-card__tag">
            {t}
          </span>
        ))}
      </div>
      <div className="photo-row__status">
        <StatusBadge status={photo.tag_status} inline />
      </div>
    </button>
  )
}

function MasterCheckbox({ allSelected, someSelected, onToggle }) {
  return (
    <button
      type="button"
      className={`select-box select-box--master${allSelected ? ' is-checked' : ''}${
        !allSelected && someSelected ? ' is-indeterminate' : ''
      }`}
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
      <div className="empty-state">
        <ImageIcon size={40} />
        <p>Belum ada foto. Scan folder dulu untuk mengisi katalog.</p>
      </div>
    )
  }

  const isList = view === 'list'
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
    <div className="grid-titlebar">
      <span className="grid-titlebar__title" title={titleLabel}>
        {titleIcon} {titleLabel}
      </span>
      <span className="grid-titlebar__count">
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

  const renderCard = (p) => (
    <PhotoCard
      key={p.id}
      photo={p}
      onActivate={activate}
      selectMode={selectMode}
      selected={isSelected(p.id)}
    />
  )

  const footer = (
    <>
      {loading && <div className="grid-loading">Memuat…</div>}
      {!loading && hasMore && (
        <div className="load-more">
          <button type="button" className="btn btn--ghost" onClick={onLoadMore}>
            Muat lebih banyak
          </button>
        </div>
      )}
    </>
  )

  if (isList) {
    return (
      <>
        {titleBar}
        <div className={`photo-list${selectMode ? ' is-select' : ''}`}>
          <div className="photo-list__head">
            {selectMode && (
              <span className="photo-list__check">
                <MasterCheckbox
                  allSelected={allSelected}
                  someSelected={someSelected}
                  onToggle={onToggleSelectAll}
                />
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
      </>
    )
  }

  return (
    <>
      {titleBar}
      {grouping ? (
        <div className="photo-groups">
          {buildGroups().map((g) => (
            <div key={g.id} className="photo-group">
              <div className="photo-group__header">
                {g.color && <span className="section-item__dot" style={{ background: g.color }} />}
                📁 {g.name} — {g.photos.length} foto
              </div>
              <div className={`photo-grid photo-grid--${view}`}>{g.photos.map(renderCard)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`photo-grid photo-grid--${view}`}>{photos.map(renderCard)}</div>
      )}
      {footer}
    </>
  )
}
