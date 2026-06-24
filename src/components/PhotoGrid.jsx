import { Image as ImageIcon } from 'lucide-react'

const STATUS_LABELS = {
  tagged: 'tagged',
  pending: 'pending',
  failed: 'failed',
  skipped: 'skipped',
}

function StatusBadge({ status }) {
  return (
    <span className={`status-badge status-badge--${status || 'pending'}`}>
      {STATUS_LABELS[status] || status || 'pending'}
    </span>
  )
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

export default function PhotoGrid({ photos, onOpen, loading, hasMore, onLoadMore }) {
  if (!loading && photos.length === 0) {
    return (
      <div className="empty-state">
        <ImageIcon size={40} />
        <p>Belum ada foto. Scan folder dulu untuk mengisi katalog.</p>
      </div>
    )
  }

  return (
    <>
      <div className="photo-grid">
        {photos.map((p) => (
          <PhotoCard key={p.id} photo={p} onOpen={onOpen} />
        ))}
      </div>

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
