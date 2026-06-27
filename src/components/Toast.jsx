// ============================================================
// Toast.jsx — tiny global toast system.
//   showToast(message, type)  — call from anywhere ('success' | 'error' | 'info')
//   <ToastHost />             — mount once near the app root
// Toasts slide in from the right and auto-dismiss after 3s.
// ============================================================

import { useState, useEffect } from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import { cn } from '../lib/cn'

// Set while a <ToastHost /> is mounted; showToast() forwards to it.
let pushToast = null
let counter = 0

/** Show a toast from anywhere. type: 'success' | 'error' | 'info'. */
export function showToast(message, type = 'info') {
  if (pushToast) pushToast(message, type)
  else if (typeof window !== 'undefined') {
    // Buffer until the host mounts (same tick race on first render).
    setTimeout(() => pushToast && pushToast(message, type), 0)
  }
}

const TYPE_STYLES = {
  success: {
    Icon: CheckCircle2,
    cls: 'border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
    icon: 'text-emerald-500',
  },
  error: {
    Icon: XCircle,
    cls: 'border-red-500/30 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300',
    icon: 'text-red-500',
  },
  info: {
    Icon: Info,
    cls: 'border-brand-500/30 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200',
    icon: 'text-brand-500',
  },
}

export function ToastHost() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    pushToast = (message, type) => {
      const id = ++counter
      setToasts((list) => [...list, { id, message, type: TYPE_STYLES[type] ? type : 'info' }])
      setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3000)
    }
    return () => {
      pushToast = null
    }
  }, [])

  const dismiss = (id) => setToasts((list) => list.filter((t) => t.id !== id))

  if (!toasts.length) return null

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex flex-col gap-2.5">
      {toasts.map((t) => {
        const { Icon, cls, icon } = TYPE_STYLES[t.type]
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex min-w-[260px] max-w-[360px] items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-sm',
              'animate-toast-in',
              cls,
            )}
            role="status"
          >
            <Icon size={18} className={cn('mt-0.5 shrink-0', icon)} />
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 opacity-50 transition hover:opacity-100"
              aria-label="Tutup"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default ToastHost
