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

// ---------------- Sections ----------------

const SECTION_COLORS = [
  '#6c8ef5', '#3ecf8e', '#f5a623', '#f55a5a', '#b06cf5',
  '#5ad1f5', '#f57ec0', '#9ad14a',
]

/**
 * Return sections with their photo_count and the list of folders
 * (distinct folder_path) that belong to each. Aggregated client-side
 * so it works with the allow-all RLS MVP setup.
 */
export async function getSections() {
  const { data: sections, error } = await supabase
    .from('sections')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) {
    console.warn('[supabase] gagal ambil sections:', error.message)
    return []
  }

  // Pull the lightweight photo→section/folder mapping for aggregation.
  const { data: rows } = await supabase
    .from('photos')
    .select('section_id, folder, folder_path')

  const bySection = new Map()
  for (const r of rows || []) {
    if (!r.section_id) continue
    if (!bySection.has(r.section_id)) bySection.set(r.section_id, { count: 0, folders: new Map() })
    const bucket = bySection.get(r.section_id)
    bucket.count++
    const key = r.folder_path || r.folder || '—'
    if (!bucket.folders.has(key)) {
      bucket.folders.set(key, { folder_path: r.folder_path, folder: r.folder, count: 0 })
    }
    bucket.folders.get(key).count++
  }

  return (sections || []).map((s) => {
    const bucket = bySection.get(s.id)
    return {
      ...s,
      photo_count: bucket?.count || 0,
      folders: bucket ? Array.from(bucket.folders.values()) : [],
    }
  })
}

export async function createSection({ name, description = '', color } = {}) {
  const clean = String(name || '').trim()
  if (!clean) throw new Error('Nama section tidak boleh kosong')
  // Pick a color deterministically if none given.
  const chosen = color || SECTION_COLORS[(clean.length + clean.charCodeAt(0)) % SECTION_COLORS.length]
  const { data, error } = await supabase
    .from('sections')
    .insert({ name: clean, description, color: chosen })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function renameSection(id, name) {
  const clean = String(name || '').trim()
  if (!clean) throw new Error('Nama section tidak boleh kosong')
  const { error } = await supabase.from('sections').update({ name: clean }).eq('id', id)
  if (error) throw error
}

/** Delete a section. Photos keep their data; section_id is set null by FK. */
export async function deleteSection(id) {
  const { error } = await supabase.from('sections').delete().eq('id', id)
  if (error) throw error
}

/** Delete every photo (and cascaded tags) under a folder_path. */
export async function deleteFolder(folderPath) {
  const { error } = await supabase.from('photos').delete().eq('folder_path', folderPath)
  if (error) throw error
}

// ---------------- Re-tag support ----------------

/** Fetch photos (with stored thumbnail) for a re-tag scope. */
export async function getPhotosForRetag({ scope, value } = {}) {
  let q = supabase
    .from('photos')
    .select('id, filename, filepath, folder, folder_path, tag_status, thumbnail_base64')
  if (scope === 'folder') q = q.eq('folder_path', value)
  else if (scope === 'section') q = q.eq('section_id', value)
  // scope === 'all' → no filter
  const { data, error } = await q
  if (error) throw error
  // Only photos we can actually re-tag (have a thumbnail, not skipped/raw).
  return (data || []).filter((p) => p.thumbnail_base64 && p.tag_status !== 'skipped')
}

/** Update only the tag_status of a photo (without touching tags). */
export async function updatePhotoStatus(id, status) {
  const { error } = await supabase.from('photos').update({ tag_status: status }).eq('id', id)
  if (error) console.warn('[supabase] gagal update status:', error.message)
}

/**
 * Apply new AI tags to a photo and update its status/model.
 * Replaces existing AI tags; manual tags are preserved.
 */
export async function applyTags(photoId, tags, model, status = 'tagged') {
  const { error: upErr } = await supabase
    .from('photos')
    .update({ tag_status: status, tag_model: model })
    .eq('id', photoId)
  if (upErr) throw upErr

  await supabase.from('tags').delete().eq('photo_id', photoId).eq('source', 'ai')

  const seen = new Set()
  const rows = []
  for (const t of tags || []) {
    const clean = String(t).toLowerCase().trim()
    if (!clean || seen.has(clean)) continue
    seen.add(clean)
    rows.push({ photo_id: photoId, tag: clean, source: 'ai' })
  }
  if (rows.length) {
    const { error: tagErr } = await supabase
      .from('tags')
      .upsert(rows, { onConflict: 'photo_id,tag' })
    if (tagErr) console.warn('[supabase] gagal simpan tags retag:', tagErr.message)
  }
}
