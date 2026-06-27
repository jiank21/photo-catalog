import { useState, useRef, useEffect } from 'react'
import { Camera } from 'lucide-react'
import { login } from '../lib/auth'
import { cn } from '../lib/cn'

export default function LoginPage({ onSuccess }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = async (value) => {
    setLoading(true)
    setError(false)
    const ok = await login(value)
    setLoading(false)
    if (ok) {
      onSuccess?.()
      return
    }
    // Wrong PIN: shake, clear, refocus.
    setError(true)
    setShake(true)
    setPin('')
    setTimeout(() => setShake(false), 500)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const onChange = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 6)
    setPin(v)
    if (error) setError(false)
    if (v.length === 6) submit(v) // auto-submit at 6 digits
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900 p-5">
      {/* Glow effect (CSS only) */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(97,114,243,0.25) 0%, rgba(97,114,243,0.08) 40%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      <div
        className={cn(
          'relative w-full max-w-[420px] animate-fade-in rounded-3xl border border-navy-700 bg-navy-800/90 p-10 text-center backdrop-blur-xl',
          shake && 'animate-shake',
        )}
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-purple-500 text-white shadow-lg">
          <Camera size={34} />
        </div>
        <h1 className="text-2xl font-bold text-white">Photo Catalog</h1>
        <p className="mt-1 text-sm text-gray-400">Masukkan PIN untuk akses</p>

        <input
          ref={inputRef}
          className="mx-auto mt-6 block h-14 w-48 rounded-xl border-2 border-navy-600 bg-navy-900 text-center text-2xl tracking-[0.5em] text-white transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={onChange}
          disabled={loading}
          maxLength={6}
          autoComplete="off"
          aria-label="PIN"
        />

        <div className="mt-4 min-h-[20px]">
          {error && <span className="text-sm text-red-400">PIN salah. Coba lagi.</span>}
          {loading && <span className="text-sm text-gray-400">Memverifikasi…</span>}
        </div>
      </div>
    </div>
  )
}
