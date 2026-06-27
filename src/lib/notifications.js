// ============================================================
// notifications.js — lightweight localStorage notification feed.
// Components listen for the 'notification:new' event to update live.
// ============================================================

const KEY = 'photo-catalog-notifications'
const MAX = 20

export function getNotifications() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* ignore (private mode / quota) */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('notification:new'))
  }
}

/** Push a new notification. type: scan_complete | tag_complete | rate_limit | retag_complete */
export function addNotification(type, message) {
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    time: Date.now(),
    read: false,
  }
  write([item, ...getNotifications()].slice(0, MAX))
  return item
}

export function markAllRead() {
  write(getNotifications().map((n) => ({ ...n, read: true })))
}

export function clearNotifications() {
  write([])
}

export function getUnreadCount() {
  return getNotifications().filter((n) => !n.read).length
}

/** Indonesian relative-time label, e.g. "2 menit lalu". */
export function relativeTime(ts) {
  const diff = Math.max(0, Date.now() - ts)
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'baru saja'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} menit lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  const d = Math.floor(h / 24)
  return `${d} hari lalu`
}
