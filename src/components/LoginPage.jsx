import { useState, useRef, useEffect } from 'react'
import { Camera } from 'lucide-react'
import { login } from '../lib/auth'

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
    <div className="login">
      <div className={`login__card${shake ? ' shake' : ''}`}>
        <div className="login__logo">
          <Camera size={36} />
        </div>
        <h1 className="login__title">Photo Catalog</h1>
        <p className="login__subtitle">Masukkan PIN untuk akses</p>

        <input
          ref={inputRef}
          className="login__pin"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={onChange}
          disabled={loading}
          maxLength={6}
          autoComplete="off"
          aria-label="PIN"
        />

        <div className="login__status">
          {error && <span className="login__error">PIN salah. Coba lagi.</span>}
          {loading && <span className="login__loading">Memverifikasi…</span>}
        </div>
      </div>
    </div>
  )
}
