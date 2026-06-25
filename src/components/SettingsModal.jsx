import { useState } from 'react'
import { X, ShieldCheck, LogOut } from 'lucide-react'
import { changePin, logout } from '../lib/auth'

const onlyDigits = (v) => v.replace(/\D/g, '').slice(0, 6)

export default function SettingsModal({ onClose, onLogout }) {
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--narrow" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Tutup">
          <X size={20} />
        </button>

        <div className="modal__info">
          <h2 className="modal__title">Pengaturan</h2>

          {/* Keamanan */}
          <div className="field">
            <label className="settings__section">
              <ShieldCheck size={14} /> Keamanan
            </label>
            <form className="settings__form" onSubmit={submit}>
              <input
                className="select"
                type="password"
                inputMode="numeric"
                placeholder="PIN Lama"
                value={oldPin}
                onChange={(e) => setOldPin(onlyDigits(e.target.value))}
                autoComplete="off"
              />
              <input
                className="select"
                type="password"
                inputMode="numeric"
                placeholder="PIN Baru"
                value={newPin}
                onChange={(e) => setNewPin(onlyDigits(e.target.value))}
                autoComplete="off"
              />
              <input
                className="select"
                type="password"
                inputMode="numeric"
                placeholder="Konfirmasi PIN Baru"
                value={confirmPin}
                onChange={(e) => setConfirmPin(onlyDigits(e.target.value))}
                autoComplete="off"
              />
              <button type="submit" className="btn btn--primary" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Ganti PIN'}
              </button>
            </form>
            {msg && <p className={`settings__msg settings__msg--${msg.type}`}>{msg.text}</p>}
          </div>

          {/* Session */}
          <div className="field">
            <label className="settings__section">Session</label>
            <button type="button" className="btn btn--danger" onClick={handleLogout}>
              <LogOut size={14} /> Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
