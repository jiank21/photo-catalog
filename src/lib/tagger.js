// ============================================================
// tagger.js — Multi-model AI auto-tagging, all from the browser.
//
// The fallback chain is no longer hardcoded here: it comes from
// modelConfig.js (Settings → AI Models). getEnabledModels() is read
// fresh on every tagImage() call, so changes to model id, API key,
// quota, order, or enabled state take effect immediately.
//
// On rate-limit (429) we mark that provider exhausted (persisted for
// today) and fall through. When every key-holding provider is exhausted
// we throw RateLimitExhaustedError so the caller can mark the photo
// "pending".
// ============================================================

import { addNotification } from './notifications'
import { getEnabledModels } from './modelConfig'

export class RateLimitExhaustedError extends Error {
  constructor(message = 'Semua model sudah mencapai limit hari ini.') {
    super(message)
    this.name = 'RateLimitExhaustedError'
  }
}

// ============================================================
// Persisted daily usage tracking (localStorage)
//   USAGE_KEY:   { "YYYY-MM-DD": { <modelId>: count } }
//   EXHAUST_KEY: { "YYYY-MM-DD": { <modelId>: true } }
//   Writes keep only today's entry, so a new day auto-resets.
//   Keys are the modelConfig ids (gemini, openrouter, groq, hf, gemma…).
// ============================================================

const USAGE_KEY = 'photo-catalog-model-usage'
const EXHAUST_KEY = 'photo-catalog-model-exhausted'

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

/** Increment today's successful-tag counter for a model id. */
export function incrementUsage(modelId) {
  if (!modelId) return
  const date = todayStr()
  const day = readStore(USAGE_KEY)[date] || {}
  day[modelId] = (day[modelId] || 0) + 1
  writeStore(USAGE_KEY, { [date]: day }) // drop other days → daily reset
  dispatchUsageUpdate()
}

/** Mark a model id as rate-limited (exhausted) for today. */
export function markExhausted(modelId) {
  if (!modelId) return
  const date = todayStr()
  const day = readStore(EXHAUST_KEY)[date] || {}
  day[modelId] = true
  writeStore(EXHAUST_KEY, { [date]: day })
  dispatchUsageUpdate()
}

/** Clear today's exhausted flags so a new scan retries every provider. */
export function resetUsage() {
  writeStore(EXHAUST_KEY, {})
  dispatchUsageUpdate()
}

/** Today's raw usage + exhausted maps keyed by model id (for the QuotaBar). */
export function getUsageToday() {
  const date = todayStr()
  return {
    date,
    used: readStore(USAGE_KEY)[date] || {},
    exhausted: readStore(EXHAUST_KEY)[date] || {},
  }
}

// ============================================================
// Gemini model auto-detection (per API key)
// ============================================================

// Tried in order when auto-detection returns nothing. Newest first.
const GEMINI_FALLBACK_MODELS = [
  'gemini-3.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash',
  'gemini-1.0-pro-vision',
]

// Cache detected models per API key (key may change at runtime via Settings).
const geminiDetectCache = {}

/**
 * Fetch the list of Gemini models that support generateContent for `apiKey`.
 * Returns an array of bare model names (no "models/" prefix).
 */
export async function getAvailableGeminiModels(apiKey) {
  if (!apiKey) return []
  if (geminiDetectCache[apiKey]) return geminiDetectCache[apiKey]
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': apiKey },
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
    geminiDetectCache[apiKey] = models
    console.log('[tagger] Gemini available models:', models)
    return models
  } catch (e) {
    console.warn('[tagger] error deteksi model Gemini:', e.message)
    return []
  }
}

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

/**
 * Ordered list of Gemini model names to try. The config's modelId is tried
 * first, then auto-detected/ranked models, then the static fallbacks.
 */
function geminiCandidateModels(configModelId, detected) {
  const out = []
  if (configModelId) out.push(configModelId)
  if (detected && detected.length) {
    const ranked = detected
      .map((name) => ({ name, score: rankGeminiModel(name) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.name)
    out.push(...ranked)
  }
  out.push(...GEMINI_FALLBACK_MODELS)
  // De-dupe while preserving order.
  return [...new Set(out.filter(Boolean))]
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
// Provider callers — each takes a model config object + image, and
// returns { text, modelName }. They throw err.skip when no key, and
// err.rateLimited on 429.
// ============================================================

function buildEndpoint(endpoint, modelId) {
  return String(endpoint || '').replace('{modelId}', modelId || '')
}

async function tagWithGemini(cfg, base64, mimeType, prompt = TAG_PROMPT) {
  if (!cfg.apiKey) {
    const e = new Error('Gemini: no API key')
    e.skip = true
    throw e
  }
  const detected = await getAvailableGeminiModels(cfg.apiKey)
  const candidates = geminiCandidateModels(cfg.modelId, detected)
  let lastErr = null

  for (const modelName of candidates) {
    const url = buildEndpoint(cfg.endpoint, modelName)
    let res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': cfg.apiKey,
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

async function tagWithOpenRouter(cfg, base64, mimeType, prompt = TAG_PROMPT) {
  if (!cfg.apiKey) {
    const e = new Error('OpenRouter: no API key')
    e.skip = true
    throw e
  }
  const res = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Photo Catalog',
    },
    body: JSON.stringify({
      model: cfg.modelId,
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
  return { text: data?.choices?.[0]?.message?.content || '', modelName: cfg.modelId }
}

// Groq — OpenAI-compatible chat completions, CORS-friendly from the browser.
async function tagWithGroq(cfg, base64, mimeType, prompt = TAG_PROMPT) {
  if (!cfg.apiKey) {
    const e = new Error('Groq: no API key')
    e.skip = true
    throw e
  }
  const res = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.modelId,
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
    throw new Error(`Groq ${res.status}: ${await res.text().catch(() => '')}`)
  }
  const data = await res.json()
  if (data?.error) {
    // Body-level error on an HTTP 200 → normal error, skip to next model.
    throw new Error(String(data.error.message || data.error || 'groq error'))
  }
  return { text: data?.choices?.[0]?.message?.content || '', modelName: cfg.modelId }
}

// HuggingFace Inference API — BLIP image captioning. Returns a caption that
// we turn into a description + simple tags. CORS-friendly from the browser.
async function tagWithHuggingFace(cfg, base64, mimeType, _prompt = TAG_PROMPT) {
  if (!cfg.apiKey) {
    const e = new Error('HuggingFace: no API key')
    e.skip = true
    throw e
  }
  const res = await fetch(buildEndpoint(cfg.endpoint, cfg.modelId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    // BLIP expects the raw base64 image string as `inputs`, not a chat body.
    body: JSON.stringify({ inputs: base64 }),
  })

  if (res.status === 429) {
    const e = new Error('rate limited')
    e.rateLimited = true
    throw e
  }
  if (!res.ok) {
    throw new Error(`HuggingFace ${res.status}: ${await res.text().catch(() => '')}`)
  }
  const data = await res.json()
  if (data?.error) {
    // Body-level error (e.g. model loading) → normal error, skip to next model.
    throw new Error(String(data.error || 'huggingface error'))
  }
  // Response shape: [{ generated_text: "a caption..." }]
  const caption = Array.isArray(data) ? data[0]?.generated_text || '' : data?.generated_text || ''
  // Turn the caption into a JSON-shaped string so the shared parser can mine
  // tags from it (keyword fallback), while keeping the caption as description.
  const tags = caption
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
  const text = JSON.stringify({ tags, description: caption, ocr_text: null })
  return { text, modelName: cfg.modelId }
}

function callProvider(model, base64, mimeType, prompt) {
  if (model.provider === 'gemini') return tagWithGemini(model, base64, mimeType, prompt)
  if (model.provider === 'groq') return tagWithGroq(model, base64, mimeType, prompt)
  if (model.provider === 'huggingface') return tagWithHuggingFace(model, base64, mimeType, prompt)
  // 'openrouter' (and anything else OpenAI-compatible) → OpenRouter caller.
  return tagWithOpenRouter(model, base64, mimeType, prompt)
}

// ============================================================
// Test a single model (text-only) from Settings → AI Models.
// Returns { ok: boolean, message: string }.
// ============================================================

export async function testModel(cfg) {
  if (!cfg.apiKey) return { ok: false, message: 'No API key' }
  const PROMPT = 'Describe this: blue sky'
  try {
    if (cfg.provider === 'gemini') {
      const url = buildEndpoint(cfg.endpoint, cfg.modelId)
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT }] }],
          generationConfig: { maxOutputTokens: 32 },
        }),
      })
      if (res.status === 429) return { ok: false, message: 'Rate limited (429)' }
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 120)}` }
      const data = await res.json()
      if (data?.error) return { ok: false, message: data.error.message || 'error' }
      return { ok: true, message: 'Working' }
    }

    if (cfg.provider === 'huggingface') {
      // BLIP is image-only; a HEAD-ish reachability check via the model page.
      const res = await fetch(buildEndpoint(cfg.endpoint, cfg.modelId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ inputs: PROMPT }),
      })
      if (res.status === 401 || res.status === 403) return { ok: false, message: `Auth failed (${res.status})` }
      if (res.status === 429) return { ok: false, message: 'Rate limited (429)' }
      // 200 OK or 503 (model loading) both mean the key + endpoint are valid.
      if (res.ok || res.status === 503) return { ok: true, message: res.status === 503 ? 'Model loading (key OK)' : 'Working' }
      return { ok: false, message: `HTTP ${res.status}` }
    }

    // OpenAI-compatible (openrouter / groq) — text-only chat.
    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
        'X-Title': 'Photo Catalog',
      },
      body: JSON.stringify({
        model: cfg.modelId,
        max_tokens: 32,
        messages: [{ role: 'user', content: PROMPT }],
      }),
    })
    if (res.status === 429) return { ok: false, message: 'Rate limited (429)' }
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 120)}` }
    const data = await res.json()
    if (data?.error) return { ok: false, message: String(data.error.message || data.error) }
    return { ok: true, message: 'Working' }
  } catch (e) {
    return { ok: false, message: e.message || 'Network error' }
  }
}

// ============================================================
// Main entry
// ============================================================

/**
 * Tag one image. base64 = raw base64 (no data: prefix).
 * Reads the enabled-model chain fresh from modelConfig each call.
 * Returns { tags, description, ocr_text, model, modelLabel } on success.
 * Throws RateLimitExhaustedError when every key-holding provider is limited.
 */
export async function tagImage(base64, mimeType = 'image/jpeg') {
  const models = getEnabledModels()
  const { exhausted } = getUsageToday() // today's persisted exhausted flags
  const withKey = models.filter((m) => m.apiKey)
  let tried = 0

  try {
    for (const model of models) {
      if (exhausted[model.id]) continue
      if (!model.apiKey) {
        console.log(`[tagger] ${model.name} skipped: no API key`)
        continue
      }

      const name = model.name
      dispatchModelActive(model.id)
      dispatchTagStatus(tried === 0 ? `🤖 Menganalisis dengan ${name}` : `🔄 Fallback ke ${name}`)
      tried++

      try {
        const out = await callProvider(model, base64, mimeType, TAG_PROMPT)
        if (!out) continue // provider self-skipped (e.g. no key)
        const { text, modelName } = out
        console.log(`[tagger] ${name} raw response:`, text)

        const parsed = parseModelJson(text, modelName || name)
        if (!parsed || !parsed.tags.length) {
          console.warn(`[tagger] ${name} returned no usable tags, trying next`)
          continue
        }
        if (parsed.fallback) {
          console.info(`[tagger] ${name} output not valid JSON; used text fallback`, parsed.tags)
        }

        // Minimum-tag enforcement: one retry on the SAME model when < 16 tags.
        let finalTags = parsed.tags
        if (finalTags.length < 16) {
          const retryPrompt = `The previous analysis only returned ${finalTags.length} tags which is insufficient. You MUST return minimum 20 tags (10 English + 10 Indonesian equivalents). Look at this image again more carefully and pair EVERY concept with both its English AND Bahasa Indonesia word as separate tags (e.g. "spider" AND "laba-laba", "red" AND "merah"). Add more specific observations about: colors, textures, lighting, composition, background elements, foreground details, image style, technical qualities of the photo — each in EN+ID pairs. Previous tags were: ${finalTags.join(', ')}. Now return a complete JSON with at least 20 tags total.`
          try {
            dispatchTagStatus(`🤖 Menambah detail dengan ${name}`)
            const out2 = await callProvider(model, base64, mimeType, retryPrompt)
            const parsed2 = parseModelJson(out2.text, modelName || name)
            const merged = normalizeTags([...finalTags, ...((parsed2 && parsed2.tags) || [])])
            console.log(
              `[tagger] ${name} retry karena hanya ${finalTags.length} tags, hasil retry: ${merged.length} tags`,
            )
            finalTags = merged
          } catch (e) {
            console.warn(`[tagger] ${name} retry gagal:`, e.message)
          }
        }

        incrementUsage(model.id) // persisted daily counter
        return { ...parsed, tags: finalTags, model: modelName || model.id, modelLabel: name }
      } catch (err) {
        if (err.skip) continue
        if (err.rateLimited) {
          exhausted[model.id] = true
          markExhausted(model.id) // persisted exhausted flag for today
          addNotification('rate_limit', `Model ${name} mencapai limit harian`)
          console.warn(`[tagger] ${name} rate limited, falling through`)
          continue
        }
        console.warn(`[tagger] ${name} error:`, err.message)
        continue
      }
    }

    // Every key-holding provider exhausted → signal "pending" to the caller.
    if (withKey.length && withKey.every((m) => exhausted[m.id])) {
      throw new RateLimitExhaustedError()
    }
    throw new Error('Tidak ada model yang berhasil memberi tag.')
  } finally {
    dispatchModelActive(null) // idle once this image is resolved
  }
}
