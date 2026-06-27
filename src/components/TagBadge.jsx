import { X } from 'lucide-react'
import { cn } from '../lib/cn'

export default function TagBadge({ tag, source, onClick, onRemove }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition',
        source === 'manual'
          ? 'bg-emerald-500/10 text-emerald-500'
          : 'bg-brand-500/10 text-brand-500',
        onClick && 'cursor-pointer hover:brightness-110',
      )}
      onClick={onClick ? () => onClick(tag) : undefined}
      title={onClick ? `Cari "${tag}"` : tag}
    >
      {tag}
      {onRemove && (
        <button
          type="button"
          className="inline-flex items-center opacity-70 transition hover:opacity-100"
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
