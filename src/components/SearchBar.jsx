import { Search } from 'lucide-react'

const selectClass =
  'rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/10 dark:bg-navy-700 dark:text-white'

export default function SearchBar({
  value,
  onChange,
  status,
  onStatusChange,
  folder,
  onFolderChange,
  folders = [],
}) {
  return (
    <div className="flex flex-1 flex-wrap gap-3">
      <div className="relative min-w-[240px] flex-1">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          placeholder="Cari tag, nama file, atau folder…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-700 transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/10 dark:bg-navy-700 dark:text-white"
        />
      </div>

      <select value={status} onChange={(e) => onStatusChange(e.target.value)} className={selectClass}>
        <option value="all">Semua status</option>
        <option value="tagged">Tagged</option>
        <option value="pending">Pending</option>
        <option value="failed">Failed</option>
        <option value="skipped">Skipped</option>
      </select>

      <select value={folder} onChange={(e) => onFolderChange(e.target.value)} className={selectClass}>
        <option value="all">Semua folder</option>
        {folders.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
    </div>
  )
}
