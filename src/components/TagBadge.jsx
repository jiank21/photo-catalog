import { X } from 'lucide-react'

export default function TagBadge({ tag, source, onClick, onRemove }) {
  return (
    <span
      className={`tag-badge${source === 'manual' ? ' tag-badge--manual' : ''}${onClick ? ' tag-badge--clickable' : ''}`}
      onClick={onClick ? () => onClick(tag) : undefined}
      title={onClick ? `Cari "${tag}"` : tag}
    >
      {tag}
      {onRemove && (
        <button
          type="button"
          className="tag-badge__remove"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(tag)
          }}
          aria-label={`Hapus tag ${tag}`}
        >
          <X size={12} />
        </button>
      )}
    </span>
  )
}
