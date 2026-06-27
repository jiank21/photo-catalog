import { useEffect, useRef, useState } from 'react'
import {
  Search,
  Bell,
  User,
  Settings,
  LogOut,
  ChevronRight,
  Sun,
  Moon,
  FolderCheck,
  Tag,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { logout } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { cn } from '../lib/cn'
import {
  getNotifications,
  getUnreadCount,
  markAllRead,
  relativeTime,
} from '../lib/notifications'

// Per-type icon + accent colour.
const NOTIF_META = {
  scan_complete: { Icon: FolderCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  tag_complete: { Icon: Tag, color: 'text-brand-500', bg: 'bg-brand-500/10' },
  rate_limit: { Icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  retag_complete: { Icon: RefreshCw, color: 'text-purple-500', bg: 'bg-purple-500/10' },
}

function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme()
  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-checked={isDark}
      aria-label="Ganti tema terang/gelap"
      className={cn(
        'relative h-7 w-14 shrink-0 rounded-full transition-all duration-300',
        isDark ? 'bg-navy-700' : 'bg-brand-500',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow transition-all duration-300',
          isDark ? 'translate-x-7 text-navy-700' : 'translate-x-0.5 text-brand-500',
        )}
      >
        {isDark ? <Moon size={13} /> : <Sun size={13} />}
      </span>
    </button>
  )
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(() => getNotifications())
  const [unread, setUnread] = useState(() => getUnreadCount())
  const ref = useRef(null)

  // Live updates from anywhere that pushes a notification.
  useEffect(() => {
    const sync = () => {
      setItems(getNotifications())
      setUnread(getUnreadCount())
    }
    window.addEventListener('notification:new', sync)
    return () => window.removeEventListener('notification:new', sync)
  }, [])

  // Click-outside to close.
  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [open])

  const handleMarkAll = () => {
    markAllRead()
    setItems(getNotifications())
    setUnread(0)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-gray-400 transition-all duration-200 hover:text-brand-500 dark:bg-navy-900"
        title="Notifikasi"
        aria-label="Notifikasi"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-[18px] text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 animate-fade-in overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-navy-700 dark:bg-navy-800">
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 dark:border-navy-700">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Notifikasi</span>
              {unread > 0 && (
                <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-xs font-medium text-brand-500">
                  {unread} baru
                </span>
              )}
            </div>
            {items.length > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="text-xs font-medium text-brand-500 transition hover:underline"
              >
                Tandai semua dibaca
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Bell size={32} className="text-gray-300 dark:text-navy-600" />
                <span className="text-sm text-gray-400">Tidak ada notifikasi</span>
              </div>
            ) : (
              items.map((n) => {
                const meta = NOTIF_META[n.type] || NOTIF_META.tag_complete
                const Icon = meta.Icon
                return (
                  <div
                    key={n.id}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 transition-colors',
                      n.read
                        ? 'hover:bg-gray-50 dark:hover:bg-navy-700/50'
                        : 'border-l-2 border-brand-500 bg-brand-500/5',
                    )}
                  >
                    <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', meta.bg, meta.color)}>
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm leading-snug">{n.message}</p>
                      <p className="mt-0.5 text-xs text-gray-400">{relativeTime(n.time)}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

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

        <ThemeToggle />

        <NotificationBell />

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
