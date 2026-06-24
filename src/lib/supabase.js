import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Surface a clear message rather than a cryptic createClient error.
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum di-set. ' +
      'Salin .env.example ke .env dan isi nilainya.',
  )
}

export const supabase = createClient(url || 'http://localhost', anonKey || 'public-anon-key', {
  auth: { persistSession: false },
})

export const hasSupabaseConfig = Boolean(url && anonKey)

// ---------------- Photo persistence helpers ----------------

/**
 * Upsert a photo by its absolute filepath, then replace its AI tags.
 * Returns the stored photo row (with id).
 */
export async function upsertPhoto(photo, tags = []) {
  const { data, error } = await supabase
    .from('photos')
    .upsert(photo, { onConflict: 'filepath' })
    .select()
    .single()

  if (error) throw error

  const photoId = data.id

  if (tags.length) {
    // Replace AI-sourced tags for this photo (manual tags are kept).
    await supabase.from('tags').delete().eq('photo_id', photoId).eq('source', 'ai')

    const rows = tags.map((t) => ({
      photo_id: photoId,
      tag: String(t).toLowerCase().trim(),
      source: 'ai',
    }))
    // Dedupe in case the model repeats a tag.
    const seen = new Set()
    const unique = rows.filter((r) => {
      if (!r.tag || seen.has(r.tag)) return false
      seen.add(r.tag)
      return true
    })
    if (unique.length) {
      const { error: tagErr } = await supabase
        .from('tags')
        .upsert(unique, { onConflict: 'photo_id,tag' })
      if (tagErr) console.warn('[supabase] gagal simpan tags:', tagErr.message)
    }
  }

  return data
}

// ---------------- Scan session helpers ----------------

export async function createScanSession(rootPath) {
  const { data, error } = await supabase
    .from('scan_sessions')
    .insert({ root_path: rootPath, status: 'running' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateScanSession(id, patch) {
  const { error } = await supabase.from('scan_sessions').update(patch).eq('id', id)
  if (error) console.warn('[supabase] gagal update scan session:', error.message)
}

// ---------------- Search / browse ----------------

export async function searchPhotos({ query = '', limit = 60, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('search_photos', {
    query,
    lim: limit,
    off: offset,
  })
  if (error) throw error
  return data || []
}

/** Get distinct folders for the filter dropdown. */
export async function getFolders() {
  const { data, error } = await supabase
    .from('photos')
    .select('folder')
    .not('folder', 'is', null)
  if (error) {
    console.warn('[supabase] gagal ambil folder:', error.message)
    return []
  }
  const set = new Set((data || []).map((r) => r.folder).filter(Boolean))
  return Array.from(set).sort()
}

/** Aggregate stats for the StatsBar. */
export async function getStats() {
  const count = async (filter) => {
    let q = supabase.from('photos').select('id', { count: 'exact', head: true })
    if (filter) q = q.eq('tag_status', filter)
    const { count: c } = await q
    return c || 0
  }
  const [total, tagged, pending, failed, skipped] = await Promise.all([
    count(null),
    count('tagged'),
    count('pending'),
    count('failed'),
    count('skipped'),
  ])
  const folders = await getFolders()
  return { total, tagged, pending, failed, skipped, folders: folders.length }
}

// ---------------- Manual tag editing ----------------

export async function addManualTag(photoId, tag) {
  const clean = String(tag).toLowerCase().trim()
  if (!clean) return
  const { error } = await supabase
    .from('tags')
    .upsert({ photo_id: photoId, tag: clean, source: 'manual' }, { onConflict: 'photo_id,tag' })
  if (error) throw error
}

export async function removeTag(photoId, tag) {
  const { error } = await supabase.from('tags').delete().eq('photo_id', photoId).eq('tag', tag)
  if (error) throw error
}

/** Pending photos (used to know if there is leftover work). */
export async function countPendingByFolder() {
  const { count } = await supabase
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('tag_status', 'pending')
  return count || 0
}
