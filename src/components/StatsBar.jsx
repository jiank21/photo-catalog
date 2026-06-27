import { Images, CheckCircle2, Clock, XCircle, FolderOpen } from 'lucide-react'

function StatCard({ icon, label, value, tone }) {
  const tones = {
    brand: 'bg-brand-500/10 text-brand-500',
    green: 'bg-emerald-500/10 text-emerald-500',
    amber: 'bg-amber-500/10 text-amber-500',
    red: 'bg-red-500/10 text-red-500',
    blue: 'bg-blue-500/10 text-blue-500',
  }
  return (
    <div className="flex flex-1 items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 dark:border-white/10 dark:bg-navy-700 dark:shadow-card-dark">
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-xl font-bold tabular-nums leading-tight">{value ?? '—'}</div>
        <div className="text-xs text-gray-400">{label}</div>
      </div>
    </div>
  )
}

export default function StatsBar({ stats }) {
  const s = stats || {}
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard icon={<Images size={20} />} label="Total foto" value={s.total} tone="brand" />
      <StatCard icon={<CheckCircle2 size={20} />} label="Tagged" value={s.tagged} tone="green" />
      <StatCard icon={<Clock size={20} />} label="Pending" value={s.pending} tone="amber" />
      <StatCard icon={<XCircle size={20} />} label="Failed" value={s.failed} tone="red" />
      <StatCard icon={<FolderOpen size={20} />} label="Folder" value={s.folders} tone="blue" />
    </div>
  )
}
