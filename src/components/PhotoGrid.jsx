import { Image as ImageIcon } from 'lucide-react'

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

function PhotoCard({ photo, onOpen }) {
  const tags = photo.tags || []
  return (
    <button type="button" className="photo-card" onClick={() => onOpen(photo)}>
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

function PhotoRow({ photo, onOpen }) {
  const tags = photo.tags || []
  return (
    <button type="button" className="photo-row" onClick={() => onOpen(photo)}>
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

export default function PhotoGrid({ photos, onOpen, loading, hasMore, onLoadMore, view = 'grid' }) {
  if (!loading && photos.length === 0) {
    return (
      <div className="empty-state">
        <ImageIcon size={40} />
        <p>Belum ada foto. Scan folder dulu untuk mengisi katalog.</p>
      </div>
    )
  }

  const isList = view === 'list'

  return (
    <>
      {isList ? (
        <div className="photo-list">
          <div className="photo-list__head">
            <span />
            <span>Nama file</span>
            <span>Folder</span>
            <span>Tanggal</span>
            <span>Ukuran</span>
            <span>Tags</span>
            <span>Status</span>
          </div>
          {photos.map((p) => (
            <PhotoRow key={p.id} photo={p} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className={`photo-grid photo-grid--${view}`}>
          {photos.map((p) => (
            <PhotoCard key={p.id} photo={p} onOpen={onOpen} />
          ))}
        </div>
      )}

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
}
