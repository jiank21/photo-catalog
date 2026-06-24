import { Images, CheckCircle2, Clock, XCircle, FolderOpen } from 'lucide-react'

function Stat({ icon, label, value, color }) {
  return (
    <div className="stat">
      <span className="stat__icon" style={color ? { color } : undefined}>
        {icon}
      </span>
      <span className="stat__value">{value ?? '—'}</span>
      <span className="stat__label">{label}</span>
    </div>
  )
}

export default function StatsBar({ stats }) {
  const s = stats || {}
  return (
    <div className="stats-bar">
      <Stat icon={<Images size={16} />} label="foto" value={s.total} />
      <Stat icon={<CheckCircle2 size={16} />} label="tagged" value={s.tagged} color="#3ecf8e" />
      <Stat icon={<Clock size={16} />} label="pending" value={s.pending} color="#f5a623" />
      <Stat icon={<XCircle size={16} />} label="failed" value={s.failed} color="#f55a5a" />
      <Stat icon={<FolderOpen size={16} />} label="folder" value={s.folders} />
    </div>
  )
}
