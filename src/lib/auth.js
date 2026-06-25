// ============================================================
// auth.js — Simple PIN gate backed by Supabase app_settings.
//   PIN is stored as a SHA-256 hash. Session lives in
//   sessionStorage for 8 hours, then auto-expires.
// ============================================================

import { supabase } from './supabase'

const SESSION_KEY = 'photo-catalog-auth'
const SESSION_MS = 8 * 60 * 60 * 1000 // 8 hours
const DEFAULT_PIN = '123123'

/** SHA-256 hex digest of a string via Web Crypto. */
export async function hashPin(pin) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin))
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ---------------- Session ----------------

export function isAuthenticated() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return false
    const s = JSON.parse(raw)
    if (!s.authenticated || !s.expiresAt || Date.now() > s.expiresAt) {
      sessionStorage.removeItem(SESSION_KEY)
      return false
    }
    return true
  } catch {
    return false
  }
}

function startSession() {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ authenticated: true, expiresAt: Date.now() + SESSION_MS }),
    )
  } catch {
    /* ignore */
  }
}

export function logout() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

// ---------------- PIN storage ----------------

async function getStoredPinHash() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'pin')
    .maybeSingle()
  if (error) {
    console.warn('[auth] gagal ambil pin dari DB:', error.message)
    return null
  }
  return data?.value || null
}

async function savePinHash(hash) {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'pin', value: hash, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) {
    console.warn('[auth] gagal simpan pin:', error.message)
    return false
  }
  return true
}

/** Insert the default PIN if none is stored yet. Safe to call repeatedly. */
export async function initDefaultPin() {
  try {
    const existing = await getStoredPinHash()
    if (existing) return
    await savePinHash(await hashPin(DEFAULT_PIN))
  } catch (e) {
    console.warn('[auth] initDefaultPin error:', e.message)
  }
}

/** Verify a PIN against the DB (falling back to the default) and start a session. */
export async function login(pin) {
  try {
    const stored = await getStoredPinHash()
    // If nothing stored yet (or DB unreachable), accept the default PIN.
    const target = stored || (await hashPin(DEFAULT_PIN))
    const hash = await hashPin(pin)
    if (hash === target) {
      startSession()
      return true
    }
    return false
  } catch (e) {
    console.warn('[auth] login error:', e.message)
    return false
  }
}

/** Change the PIN. Returns false if the old PIN is wrong or the save fails. */
export async function changePin(oldPin, newPin) {
  try {
    const stored = await getStoredPinHash()
    const target = stored || (await hashPin(DEFAULT_PIN))
    if ((await hashPin(oldPin)) !== target) return false
    return await savePinHash(await hashPin(newPin))
  } catch (e) {
    console.warn('[auth] changePin error:', e.message)
    return false
  }
}
