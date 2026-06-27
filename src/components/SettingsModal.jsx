import { useState } from 'react'
import { X, ShieldCheck, LogOut } from 'lucide-react'
import { changePin, logout } from '../lib/auth'
import { cn } from '../lib/cn'

const onlyDigits = (v) => v.replace(/\D/g, '').slice(0, 6)

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/10 dark:bg-navy-900 dark:text-white'

const TABS = [
  { id: 'security', label: 'Keamanan' },
  { id: 'session', label: 'Session' },
]

export default function SettingsModal({ onClose, onLogout }) {
  const [tab, setTab] = useState('security')
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [msg, setMsg] = useState(null) // { type: 'success' | 'error', text }
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setMsg(null)

    if (![oldPin, newPin, confirmPin].every((p) => /^\d{6}$/.test(p))) {
      setMsg({ type: 'error', text: 'Semua PIN harus 6 digit angka.' })
      return
    }
    if (newPin !== confirmPin) {
      setMsg({ type: 'error', text: 'PIN baru dan konfirmasi tidak sama.' })
      return
    }

    setBusy(true)
    const ok = await changePin(oldPin, newPin)
    setBusy(false)
    if (ok) {
      setMsg({ type: 'success', text: 'PIN berhasil diganti' })
      setOldPin('')
      setNewPin('')
      setConfirmPin('')
    } else {
      setMsg({ type: 'error', text: 'PIN lama salah.' })
    }
  }

  const handleLogout = () => {
    logout()
    onLogout?.()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[440px] rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-navy-800"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 dark:hover:bg-navy-700"
          onClick={onClose}
          aria-label="Tutup"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-bold">Pengaturan</h2>

        {/* Tabs */}
        <div className="mt-4 flex gap-1 border-b border-gray-200 dark:border-white/10">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn(
                '-mb-px border-b-2 px-4 py-2.5 text-sm transition',
                tab === t.id
                  ? 'border-brand-500 font-semibold text-brand-500'
                  : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-200',
              )}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'security' && (
          <div className="mt-5">
            <label className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
              <ShieldCheck size={14} /> Ganti PIN
            </label>
            <form className="flex flex-col gap-2.5" onSubmit={submit}>
              <input
                className={inputClass}
                type="password"
                inputMode="numeric"
                placeholder="PIN Lama"
                value={oldPin}
                onChange={(e) => setOldPin(onlyDigits(e.target.value))}
                autoComplete="off"
              />
              <input
                className={inputClass}
                type="password"
                inputMode="numeric"
                placeholder="PIN Baru"
                value={newPin}
                onChange={(e) => setNewPin(onlyDigits(e.target.value))}
                autoComplete="off"
              />
              <input
                className={inputClass}
                type="password"
                inputMode="numeric"
                placeholder="Konfirmasi PIN Baru"
                value={confirmPin}
                onChange={(e) => setConfirmPin(onlyDigits(e.target.value))}
                autoComplete="off"
              />
              <button
                type="submit"
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:-translate-y-0.5 disabled:opacity-50"
                disabled={busy}
              >
                {busy ? 'Menyimpan…' : 'Ganti PIN'}
              </button>
            </form>
            {msg && (
              <p
                className={cn(
                  'mt-3 text-sm',
                  msg.type === 'success' ? 'text-emerald-500' : 'text-red-500',
                )}
              >
                {msg.text}
              </p>
            )}
          </div>
        )}

        {tab === 'session' && (
          <div className="mt-5">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-400">
              Session
            </label>
            <p className="mb-3 text-sm text-gray-400">
              Keluar dari sesi ini. Kamu perlu memasukkan PIN lagi untuk masuk.
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-500 transition-all duration-200 hover:bg-red-500 hover:text-white"
              onClick={handleLogout}
            >
              <LogOut size={14} /> Logout
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
