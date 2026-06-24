import { Search } from 'lucide-react'

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
    <div className="search-bar">
      <div className="search-bar__input">
        <Search size={16} className="search-bar__icon" />
        <input
          type="text"
          placeholder="Cari tag, nama file, atau folder…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>

      <select value={status} onChange={(e) => onStatusChange(e.target.value)} className="select">
        <option value="all">Semua status</option>
        <option value="tagged">Tagged</option>
        <option value="pending">Pending</option>
        <option value="failed">Failed</option>
        <option value="skipped">Skipped</option>
      </select>

      <select value={folder} onChange={(e) => onFolderChange(e.target.value)} className="select">
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
