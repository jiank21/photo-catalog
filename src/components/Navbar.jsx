import { useEffect, useRef, useState } from 'react'
import { Search, Bell, User, Settings, LogOut, ChevronRight } from 'lucide-react'
import { logout } from '../lib/auth'

export default function Navbar({
  sectionName,
  folderName,
  query,
  onQueryChange,
  onOpenSettings,
  onLogout,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  const crumbs = ['Photo Catalog']
  if (sectionName) crumbs.push(sectionName)
  if (folderName) crumbs.push(folderName)

  return (
    <header className="sticky top-0 z-20 flex h-20 shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white/80 px-6 backdrop-blur-md dark:border-navy-700 dark:bg-navy-800/50">
      {/* Breadcrumb */}
      <nav className="flex min-w-0 items-center gap-1.5 text-sm text-gray-400" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight size={14} className="shrink-0" />}
            <span
              className={
                i === crumbs.length - 1
                  ? 'truncate font-semibold text-gray-700 dark:text-white'
                  : 'truncate'
              }
            >
              {c}
            </span>
          </span>
        ))}
      </nav>

      {/* Right cluster */}
      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Cari cepat…"
            className="w-44 rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-700 transition-all duration-200 focus:w-56 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-navy-700 dark:bg-navy-900 dark:text-white"
          />
        </div>

        <button
          type="button"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-gray-400 transition-all duration-200 hover:text-brand-500 dark:bg-navy-900"
          title="Notifikasi"
          aria-label="Notifikasi"
        >
          <Bell size={18} />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand-500" />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 text-white shadow-md transition-transform duration-200 hover:-translate-y-0.5"
            aria-label="Menu pengguna"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <User size={18} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-12 z-30 w-48 animate-fade-in overflow-hidden rounded-2xl border border-gray-100 bg-white p-2 shadow-card dark:border-navy-700 dark:bg-navy-800 dark:shadow-card-dark">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-navy-700"
                onClick={() => {
                  setMenuOpen(false)
                  onOpenSettings?.()
                }}
              >
                <Settings size={16} /> Pengaturan
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-red-500 transition hover:bg-red-500/10"
                onClick={() => {
                  setMenuOpen(false)
                  logout()
                  onLogout?.()
                }}
              >
                <LogOut size={16} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
