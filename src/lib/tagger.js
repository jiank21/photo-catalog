// ============================================================
// tagger.js — Multi-model AI auto-tagging, all from the browser.
//
// Fallback chain (in order):
//   1. Gemini           — auto-detects an available model
//   2. OpenRouter Auto Free (openrouter/free)
//   3. NVIDIA NIM       — meta/llama-3.2-11b-vision-instruct (skip if no key)
//   4. Gemma 4 31B      — google/gemma-4-31b-it:free (explicit fallback)
//
// On rate-limit (429) we mark that provider exhausted and fall through.
// When every key-holding provider is exhausted we throw
// RateLimitExhaustedError so the caller can mark the photo "pending".
// ============================================================

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY
const OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_API_KEY
const NVIDIA_KEY = import.meta.env.VITE_NVIDIA_API_KEY

export class RateLimitExhaustedError extends Error {
  constructor(message = 'Semua model sudah mencapai limit hari ini.') {
    super(message)
    this.name = 'RateLimitExhaustedError'
  }
}

// ---------------- Model / provider chain ----------------
// provider: 'gemini' | 'openrouter' | 'nvidia'
// For gemini the actual model is resolved at call time (auto-detect).
export const MODELS = [
  {
    id: 'gemini',
    label: 'Gemini (auto)',
    provider: 'gemini',
    dailyLimit: 1500,
  },
  {
    id: 'openrouter/free',
    label: 'OpenRouter Auto Free',
    provider: 'openrouter',
    dailyLimit: 200,
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM (Llama Vision)',
    provider: 'nvidia',
    model: 'meta/llama-3.2-11b-vision-instruct',
    dailyLimit: 1000,
  },
  {
    id: 'google/gemma-4-31b-it:free',
    label: 'Gemma 4 31B (vision)',
    provider: 'openrouter',
    dailyLimit: 200,
  },
]

function modelHasKey(model) {
  if (model.provider === 'gemini') return !!GEMINI_KEY
  if (model.provider === 'nvidia') return !!NVIDIA_KEY
  return !!OPENROUTER_KEY
}

// ---------------- Per-session usage tracking ----------------
const usage = {}
for (const m of MODELS) usage[m.id] = { used: 0, exhausted: false }

export function getUsage() {
  return MODELS.map((m) => ({
    id: m.id,
    label: m.label,
    used: usage[m.id].used,
    limit: m.dailyLimit,
    exhausted: usage[m.id].exhausted,
    available: modelHasKey(m),
  }))
}

export function resetUsage() {
  for (const m of MODELS) usage[m.id] = { used: 0, exhausted: false }
}

/** True when every provider that actually has an API key is rate-limited. */
export function allExhausted() {
  const usable = MODELS.filter(modelHasKey)
  if (!usable.length) return false
  return usable.every((m) => usage[m.id].exhausted)
}

// ============================================================
// Persisted daily usage tracking (localStorage)
//   USAGE_KEY:   { "YYYY-MM-DD": { gemini, openrouter, nvidia, gemma } }
//   EXHAUST_KEY: { "YYYY-MM-DD": { gemini: true, ... } }
//   Writes keep only today's entry, so a new day auto-resets.
// ============================================================

const USAGE_KEY = 'photo-catalog-model-usage'
const EXHAUST_KEY = 'photo-catalog-model-exhausted'

// Simplified id → display + quota + availability.
const USAGE_MODELS = [
  { id: 'gemini', name: 'Gemini 3 Flash', short: 'Gemini', quota: 500, hasKey: () => !!GEMINI_KEY },
  { id: 'openrouter', name: 'OpenRouter Free', short: 'OpenRouter', quota: 200, hasKey: () => !!OPENROUTER_KEY },
  { id: 'nvidia', name: 'NVIDIA NIM', short: 'NVIDIA', quota: 1000, hasKey: () => !!NVIDIA_KEY },
  { id: 'gemma', name: 'Gemma 4 31B', short: 'Gemma', quota: 200, hasKey: () => !!OPENROUTER_KEY },
]

// Map a chain model.id (or already-simplified id) to a simplified usage id.
function normUsageId(modelId) {
  switch (modelId) {
    case 'gemini':
      return 'gemini'
    case 'openrouter':
    case 'openrouter/free':
      return 'openrouter'
    case 'nvidia':
      return 'nvidia'
    case 'gemma':
    case 'google/gemma-4-31b-it:free':
      return 'gemma'
    default:
      return null
  }
}

function todayStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function readStore(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}')
  } catch {
    return {}
  }
}

function writeStore(key, obj) {
  try {
    localStorage.setItem(key, JSON.stringify(obj))
  } catch {
    /* ignore (private mode / quota) */
  }
}

function dispatchUsageUpdate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tagger:usage-update'))
  }
}

// Friendly names for status lines / active-model events.
const STATUS_NAMES = {
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
  nvidia: 'NVIDIA',
  gemma: 'Gemma',
}

function dispatchModelActive(modelId) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tagger:model-active', { detail: { modelId } }))
  }
}

function dispatchTagStatus(text) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tagger:status', { detail: { text } }))
  }
}

/** Increment today's successful-tag counter for a model. */
export function incrementUsage(modelId) {
  const id = normUsageId(modelId)
  if (!id) return
  const date = todayStr()
  const day = readStore(USAGE_KEY)[date] || { gemini: 0, openrouter: 0, nvidia: 0, gemma: 0 }
  day[id] = (day[id] || 0) + 1
  writeStore(USAGE_KEY, { [date]: day }) // drop other days → daily reset
  dispatchUsageUpdate()
}

/** Mark a model as rate-limited (exhausted) for today. */
export function markExhausted(modelId) {
  const id = normUsageId(modelId)
  if (!id) return
  const date = todayStr()
  const day = readStore(EXHAUST_KEY)[date] || {}
  day[id] = true
  writeStore(EXHAUST_KEY, { [date]: day })
  dispatchUsageUpdate()
}

/** Snapshot of today's quota usage for the UI. */
export function getUsageStats() {
  const date = todayStr()
  const used = readStore(USAGE_KEY)[date] || {}
  const exh = readStore(EXHAUST_KEY)[date] || {}
  let totalRemaining = 0
  let totalUsedToday = 0

  const models = USAGE_MODELS.map((m) => {
    const u = used[m.id] || 0
    const exhausted = !!exh[m.id]
    const available = m.hasKey()
    const remaining = exhausted ? 0 : Math.max(0, m.quota - u)
    totalUsedToday += u
    if (available) totalRemaining += remaining
    return {
      name: m.name,
      short: m.short,
      id: m.id,
      quota: m.quota,
      used: u,
      remaining,
      exhausted,
      available,
    }
  })

  return { date, models, totalRemaining, totalUsedToday }
}

// ============================================================
// Gemini model auto-detection
// ============================================================

// Tried in order when auto-detection returns nothing. Newest first
// (gemini-3.5-flash is the latest per Google AI Studio docs).
const GEMINI_FALLBACK_MODELS = [
  'gemini-3.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash',
  'gemini-1.0-pro-vision',
]

let geminiAvailableModels = []
let geminiInitPromise = null

/**
 * Fetch the list of Gemini models that support generateContent.
 * Returns an array of bare model names (no "models/" prefix).
 */
export async function getAvailableGeminiModels() {
  if (!GEMINI_KEY) {
    console.warn('[tagger] VITE_GEMINI_API_KEY belum di-set; lewati deteksi model Gemini')
    return []
  }
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': GEMINI_KEY },
    })
    if (!res.ok) {
      console.warn(`[tagger] gagal ambil daftar model Gemini: ${res.status}`)
      return []
    }
    const data = await res.json()
    const models = (data.models || [])
      .filter(
        (m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent'),
      )
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .filter(Boolean)
    console.log('[tagger] Gemini available models:', models)
    return models
  } catch (e) {
    console.warn('[tagger] error deteksi model Gemini:', e.message)
    return []
  }
}

// Kick off detection once at module load (non-blocking, lazy-awaited).
function ensureGeminiInit() {
  if (!geminiInitPromise) {
    geminiInitPromise = getAvailableGeminiModels().then((m) => {
      geminiAvailableModels = m
      return m
    })
  }
  return geminiInitPromise
}
ensureGeminiInit()

// Score a detected model: prefer flash/pro, newest version first.
function rankGeminiModel(name) {
  const n = name.toLowerCase()
  if (!n.includes('flash') && !n.includes('pro')) return -1
  let score
  if (n.includes('3.5') || n.includes('3-5') || /\b3\b/.test(n)) score = 400
  else if (n.includes('2.0') || n.includes('2-0') || /\b2\b/.test(n)) score = 300
  else if (n.includes('1.5')) score = 200
  else score = 100
  if (n.includes('flash')) score += 10 // prefer flash within a version
  return score
}

// Ordered list of Gemini model names to try.
function geminiCandidateModels() {
  if (geminiAvailableModels.length) {
    const ranked = geminiAvailableModels
      .map((name) => ({ name, score: rankGeminiModel(name) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.name)
    if (ranked.length) return ranked
  }
  return GEMINI_FALLBACK_MODELS
}

// ============================================================
// Prompt
// ============================================================
const TAG_PROMPT = `You are an expert photo cataloger fluent in English and Bahasa Indonesia. Analyze this photo carefully and return ONLY a valid JSON object with no markdown, no explanation, nothing else.

Required format:
{"tags":["tag1","tag2"],"description":"One sentence in English.","ocr_text":"visible text or null"}

MANDATORY TAGGING RULES:
- Generate MINIMUM 20 tags (10 English + 10 Bahasa Indonesia equivalents)
- Maximum 30 tags total
- For EVERY concept you identify, include BOTH the English AND Indonesian word as separate tags
  Examples: "spider" AND "laba-laba", "sunset" AND "matahari terbenam", "portrait" AND "potret", "wedding" AND "pernikahan", "motherboard" AND "papan sirkuit", "forest" AND "hutan", "woman" AND "perempuan", "building" AND "gedung"
- FIRST two tags must be the most specific primary subject in English then Indonesian
  (e.g. "jumping spider", "laba-laba pelompat" — NOT just "spider" or "insect")
- Then add paired EN+ID tags for: secondary subjects, specific object names, colors, setting/environment, lighting, mood, composition, materials/textures
- For animals: species name (EN+ID), color pattern, behavior
- For products/tech: exact product type (EN+ID), brand if visible, condition
- For people: count, apparent activity (EN+ID), clothing colors
- For landscapes: specific location type (EN+ID), weather, season, time of day
- For architecture: building type (EN+ID), style, material
- Colors in BOTH languages: "red" AND "merah", "dark blue" AND "biru tua"
- NEVER use generic tags: image, photo, picture, photograph, object, thing, gambar, foto, objek
- If image seems simple, analyze deeper: background, lighting quality, texture, composition style, focus quality, shadows, patterns — all in EN+ID pairs

CONTENT SAFETY FILTER:
- Do NOT include these as tags: safe, safety, user, content, policy, inappropriate, explicit, nsfw, violence, harmful, restricted, blocked, moderated, flagged, warning, adult, sensitive

OCR: Extract ALL visible text including labels, signs, watermarks — include in ocr_text field.

RETRY RULE: If you cannot find 20 tags, look harder. There are always at least 10 distinct concepts in any photo. Every concept = 2 tags (EN + ID).

Return ONLY the JSON object. No markdown fences. No explanation. No text before or after the JSON.`

// ============================================================
// Response parsing
// ============================================================

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'is', 'are', 'was',
  'were', 'be', 'this', 'that', 'these', 'those', 'with', 'for', 'it', 'its', 'as',
  'by', 'from', 'photo', 'image', 'picture', 'shows', 'showing', 'show', 'there',
  'here', 'has', 'have', 'contains', 'depicts', 'appears', 'seems', 'some', 'into',
  'tags', 'tag', 'description', 'json', 'array', 'keywords', 'object', 'response',
  'photograph', 'thing', 'item', 'visible', 'text', 'null', 'one', 'sentence',
  'dan', 'atau', 'yang', 'di', 'ke', 'dari', 'ini', 'itu', 'sebuah', 'dengan',
  'gambar', 'foto', 'adalah', 'pada', 'untuk', 'ada', 'terdapat',
])

// Content-safety labels some models emit — never valid photo descriptions.
const SAFETY_BLACKLIST = [
  'safe', 'safety', 'user', 'content', 'policy', 'inappropriate',
  'explicit', 'nsfw', 'violence', 'harmful', 'restricted', 'blocked',
  'moderated', 'flagged', 'warning', 'adult', 'sensitive',
]

function isSafetyTag(tag) {
  return SAFETY_BLACKLIST.some((w) => tag.includes(w))
}

function normalizeTags(arr, max = 30) {
  if (!Array.isArray(arr)) return []
  const seen = new Set()
  const out = []
  for (const t of arr) {
    const clean = String(t).toLowerCase().trim().replace(/^["'#\s]+|["'.,;\s]+$/g, '')
    if (!clean || clean === 'null' || seen.has(clean)) continue
    if (STOPWORDS.has(clean)) continue
    if (isSafetyTag(clean)) continue // drop content-safety labels
    seen.add(clean)
    out.push(clean)
    if (out.length >= max) break
  }
  return out
}

// Last-resort: pull keyword-ish tokens out of arbitrary text.
function keywordsFromText(text) {
  const cleaned = text
    .replace(/```[a-z]*|```/gi, ' ')
    .replace(/[{}\[\]"`]/g, ' ')
    .replace(/\b(tags?|description|ocr_text)\b\s*:/gi, ' ')
  const words = cleaned
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
  const seen = new Set()
  const out = []
  for (const w of words) {
    if (seen.has(w)) continue
    seen.add(w)
    out.push(w)
    if (out.length >= 15) break
  }
  return out
}

function firstSentence(text) {
  const s = text.replace(/```[a-z]*|```/gi, ' ').replace(/[{}\[\]"`]/g, ' ').trim()
  const m = s.match(/[^.!?\n]{8,}?[.!?]/)
  return (m ? m[0] : s).trim().slice(0, 200)
}

function cleanOcr(v) {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'none') return null
  return s
}

const FIELD_KEYS = /^(tags?|description|ocr_text|ocr|caption|keywords|labels|subjects|objects)$/i

/** Pull a string field value out of raw (possibly truncated) JSON text. */
function extractStringField(raw, field) {
  const m = raw.match(new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`, 'i'))
  return m ? m[1] : ''
}

/**
 * Recover tags from JSON that failed to parse (e.g. truncated output with
 * no closing brace). Targets the "tags": [ ... ] region when present and
 * collects the quoted string values; otherwise scans all quoted strings.
 * Filters to reasonable values (2-50 chars) and drops JSON field names.
 */
function recoverTruncatedTags(raw) {
  let region
  const m = raw.match(/"tags"\s*:\s*\[/i)
  if (m) {
    region = raw.slice(m.index + m[0].length)
    const close = region.indexOf(']')
    if (close !== -1) region = region.slice(0, close)
    // If the array never closed, stop before the next field begins.
    const stop = region.search(/"(description|ocr_text|ocr|caption|keywords|labels|subjects)"\s*:/i)
    if (stop !== -1) region = region.slice(0, stop)
  } else {
    region = raw
  }
  const out = []
  const re = /"([^"]{2,50})"/g
  let mm
  while ((mm = re.exec(region))) {
    const v = mm[1].trim()
    if (!v || FIELD_KEYS.test(v)) continue
    out.push(v)
  }
  return out
}

/**
 * Best-effort parse of a model response into { tags, description, ocr_text }.
 * Preserves multi-word tags exactly as returned. Only resorts to plain-text
 * keyword extraction when the JSON cannot be parsed AND truncation recovery
 * finds nothing. Always logs the resulting tag count.
 */
function parseModelJson(text, modelName = 'model') {
  const logCount = (n, note = '') =>
    console.log(`[tagger] ${modelName} parsed result: ${n} tags${note ? ` (${note})` : ''}`)

  if (!text || !text.trim()) {
    logCount(0)
    return null
  }

  // Strip markdown fences (```json ... ``` or ``` ... ```).
  let s = text.trim().replace(/```json/gi, '```')
  const fence = s.match(/```\s*([\s\S]*?)```/)
  if (fence) s = fence[1].trim()

  // Isolate the JSON object: first "{" to last "}".
  let obj = null
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    try {
      obj = JSON.parse(s.slice(first, last + 1))
    } catch {
      obj = null
    }
  }
  if (!obj) {
    try {
      obj = JSON.parse(s)
    } catch {
      obj = null
    }
  }

  // ---- JSON parsed cleanly: preserve array tags exactly (no tokenizing) ----
  if (obj && typeof obj === 'object') {
    let tags = obj.tags

    // tags present but not an array → coerce (only this non-array case splits).
    if (tags && !Array.isArray(tags)) {
      tags = typeof tags === 'string' ? tags.split(/[,\n]/) : [tags]
    }

    // No usable tags field → try alternate fields.
    if (!Array.isArray(tags) || !tags.length) {
      const alt = obj.keywords || obj.labels || obj.subjects || obj.objects
      if (Array.isArray(alt)) tags = alt
      else if (typeof alt === 'string') tags = alt.split(/[,\n]/)
    }

    // Multi-word tags like "asrock b450 pro4" are kept whole here.
    const norm = normalizeTags(tags || [])
    if (norm.length) {
      logCount(norm.length)
      return {
        tags: norm,
        description:
          typeof obj.description === 'string'
            ? obj.description
            : typeof obj.caption === 'string'
              ? obj.caption
              : '',
        ocr_text: cleanOcr(obj.ocr_text ?? obj.ocr ?? obj.text),
      }
    }
    // Parsed object had no usable tags — fall through to recovery.
  }

  // ---- JSON parse failed (e.g. truncated): recover quoted string values ----
  const recovered = normalizeTags(recoverTruncatedTags(s))
  if (recovered.length) {
    logCount(recovered.length, 'recovered')
    return {
      tags: recovered,
      description: extractStringField(s, 'description'),
      ocr_text: cleanOcr(extractStringField(s, 'ocr_text')),
      recovered: true,
    }
  }

  // ---- Last resort: keyword extraction from plain text ----
  const tags = keywordsFromText(text)
  logCount(tags.length, 'text fallback')
  if (!tags.length) return null
  return { tags, description: firstSentence(text), ocr_text: null, fallback: true }
}

// ============================================================
// Provider callers — each returns { text, modelName }
// ============================================================

async function tagWithGemini(base64, mimeType, prompt = TAG_PROMPT) {
  if (!GEMINI_KEY) {
    const e = new Error('VITE_GEMINI_API_KEY belum di-set')
    e.skip = true
    throw e
  }
  await ensureGeminiInit()
  const candidates = geminiCandidateModels()
  let lastErr = null

  for (const modelName of candidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`
    let res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: base64 } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024,
            response_mime_type: 'application/json',
          },
        }),
      })
    } catch (e) {
      lastErr = e
      continue
    }

    if (res.status === 404) {
      console.warn(`[tagger] Gemini model ${modelName} → 404, coba model berikutnya`)
      continue
    }
    if (res.status === 429) {
      const e = new Error('rate limited')
      e.rateLimited = true
      throw e
    }
    if (!res.ok) {
      lastErr = new Error(`Gemini ${res.status}: ${await res.text().catch(() => '')}`)
      console.warn(`[tagger] Gemini model ${modelName} → error ${res.status}, coba berikutnya`)
      continue
    }

    const data = await res.json()
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
    console.log(`[tagger] Gemini using model: ${modelName}`)
    return { text, modelName }
  }

  throw lastErr || new Error('Semua model Gemini gagal (404/error)')
}

async function tagWithOpenRouter(model, base64, mimeType, prompt = TAG_PROMPT) {
  if (!OPENROUTER_KEY) {
    const e = new Error('VITE_OPENROUTER_API_KEY belum di-set')
    e.skip = true
    throw e
  }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Photo Catalog',
    },
    body: JSON.stringify({
      model: model.id,
      temperature: 0.2,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
    }),
  })

  if (res.status === 429) {
    const e = new Error('rate limited')
    e.rateLimited = true
    throw e
  }
  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${await res.text().catch(() => '')}`)
  }
  const data = await res.json()
  if (data?.error) {
    // Body-level error on an HTTP 200. NOT a 429, so treat it as an ordinary
    // error and skip to the next model — do NOT mark the provider exhausted.
    throw new Error(data.error.message || 'openrouter error')
  }
  return { text: data?.choices?.[0]?.message?.content || '', modelName: model.id }
}

async function tagWithNvidia(model, base64, mimeType, prompt = TAG_PROMPT) {
  const key = import.meta.env.VITE_NVIDIA_API_KEY
  console.log('[tagger] NVIDIA key present:', !!key, 'length:', key?.length)
  if (!key) {
    console.log('[tagger] NVIDIA skipped: no API key')
    return null
  }
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
      max_tokens: 1024,
      temperature: 0.2,
    }),
  })

  if (res.status === 429) {
    const e = new Error('rate limited')
    e.rateLimited = true
    throw e
  }
  if (!res.ok) {
    throw new Error(`NVIDIA ${res.status}: ${await res.text().catch(() => '')}`)
  }
  const data = await res.json()
  if (data?.error) {
    // Body-level error on an HTTP 200. NOT a 429, so treat it as an ordinary
    // error and skip to the next model — do NOT mark the provider exhausted.
    throw new Error(String(data.error.message || data.error || 'nvidia error'))
  }
  return { text: data?.choices?.[0]?.message?.content || '', modelName: model.model }
}

// ============================================================
// Main entry
// ============================================================

/**
 * Tag one image. base64 = raw base64 (no data: prefix).
 * Returns { tags, description, ocr_text, model, modelLabel } on success.
 * Throws RateLimitExhaustedError when every key-holding provider is limited.
 */
async function callProvider(model, base64, mimeType, prompt) {
  if (model.provider === 'gemini') return tagWithGemini(base64, mimeType, prompt)
  if (model.provider === 'nvidia') return tagWithNvidia(model, base64, mimeType, prompt)
  return tagWithOpenRouter(model, base64, mimeType, prompt)
}

export async function tagImage(base64, mimeType = 'image/jpeg') {
  let tried = 0
  try {
    for (const model of MODELS) {
      if (usage[model.id].exhausted) continue
      if (!modelHasKey(model)) continue

      const simpleId = normUsageId(model.id)
      const name = STATUS_NAMES[simpleId] || model.label
      dispatchModelActive(simpleId)
      dispatchTagStatus(tried === 0 ? `🤖 Menganalisis dengan ${name}` : `🔄 Fallback ke ${name}`)
      tried++

      try {
        const out = await callProvider(model, base64, mimeType, TAG_PROMPT)
        if (!out) continue // provider self-skipped (e.g. no key)
        const { text, modelName } = out
        console.log(`[tagger] ${model.label} raw response:`, text)

        const parsed = parseModelJson(text, modelName || model.label)
        if (!parsed || !parsed.tags.length) {
          console.warn(`[tagger] ${model.label} returned no usable tags, trying next`)
          continue
        }
        if (parsed.fallback) {
          console.info(`[tagger] ${model.label} output not valid JSON; used text fallback`, parsed.tags)
        }

        // Minimum-tag enforcement: one retry on the SAME model when < 8 tags.
        let finalTags = parsed.tags
        if (finalTags.length < 16) {
          const retryPrompt = `The previous analysis only returned ${finalTags.length} tags which is insufficient. You MUST return minimum 20 tags (10 English + 10 Indonesian equivalents). Look at this image again more carefully and pair EVERY concept with both its English AND Bahasa Indonesia word as separate tags (e.g. "spider" AND "laba-laba", "red" AND "merah"). Add more specific observations about: colors, textures, lighting, composition, background elements, foreground details, image style, technical qualities of the photo — each in EN+ID pairs. Previous tags were: ${finalTags.join(', ')}. Now return a complete JSON with at least 20 tags total.`
          try {
            dispatchTagStatus(`🤖 Menambah detail dengan ${name}`)
            const out2 = await callProvider(model, base64, mimeType, retryPrompt)
            const parsed2 = parseModelJson(out2.text, modelName || model.label)
            const merged = normalizeTags([...finalTags, ...((parsed2 && parsed2.tags) || [])])
            console.log(
              `[tagger] ${model.label} retry karena hanya ${finalTags.length} tags, hasil retry: ${merged.length} tags`,
            )
            finalTags = merged
          } catch (e) {
            console.warn(`[tagger] ${model.label} retry gagal:`, e.message)
          }
        }

        usage[model.id].used += 1
        incrementUsage(model.id) // persisted daily counter
        return { ...parsed, tags: finalTags, model: modelName || model.id, modelLabel: model.label }
      } catch (err) {
        if (err.skip) continue
        if (err.rateLimited) {
          usage[model.id].exhausted = true
          markExhausted(model.id) // persisted exhausted flag for today
          console.warn(`[tagger] ${model.label} rate limited, falling through`)
          continue
        }
        console.warn(`[tagger] ${model.label} error:`, err.message)
        continue
      }
    }

    if (allExhausted()) {
      throw new RateLimitExhaustedError()
    }
    throw new Error('Tidak ada model yang berhasil memberi tag.')
  } finally {
    dispatchModelActive(null) // idle once this image is resolved
  }
}
