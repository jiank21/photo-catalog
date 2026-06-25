// ============================================================
// tagger.js — Multi-model AI auto-tagging, all from the browser.
//
// Chain of vision models tried in priority order. On rate-limit
// (429) or error we fall through to the next model. If every model
// is exhausted we throw RateLimitExhaustedError so the caller can
// mark the photo "pending" and stop the batch.
// ============================================================

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY
const OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_API_KEY

export class RateLimitExhaustedError extends Error {
  constructor(message = 'Semua model sudah mencapai limit hari ini.') {
    super(message)
    this.name = 'RateLimitExhaustedError'
  }
}

// ---------------- Model definitions ----------------
// provider: 'gemini' | 'openrouter'
// dailyLimit is informational; we track usage per session for display.
export const MODELS = [
  {
    id: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
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
    id: 'google/gemma-4-31b-it:free',
    label: 'Gemma 4 31B (vision)',
    provider: 'openrouter',
    dailyLimit: 200,
  },
]

// ---------------- Per-session usage tracking ----------------
// { [modelId]: { used: number, exhausted: boolean } }
const usage = {}
for (const m of MODELS) usage[m.id] = { used: 0, exhausted: false }

export function getUsage() {
  return MODELS.map((m) => ({
    id: m.id,
    label: m.label,
    used: usage[m.id].used,
    limit: m.dailyLimit,
    exhausted: usage[m.id].exhausted,
  }))
}

export function resetUsage() {
  for (const m of MODELS) usage[m.id] = { used: 0, exhausted: false }
}

export function allExhausted() {
  return MODELS.every((m) => usage[m.id].exhausted)
}

// ---------------- Prompt ----------------
const PROMPT = `You are an image tagging assistant. Analyse the photo and respond with ONLY a JSON object (no markdown, no prose) with exactly these keys:
{
  "tags": [5-15 short lowercase keyword strings describing subjects, scene, colors, mood, objects],
  "description": "one short sentence describing the photo",
  "ocr_text": "any text visible in the image, or null if none"
}`

// ---------------- Response parsing ----------------

// Words to drop when falling back to extracting tags from free text.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'is', 'are', 'was',
  'were', 'be', 'this', 'that', 'these', 'those', 'with', 'for', 'it', 'its', 'as',
  'by', 'from', 'photo', 'image', 'picture', 'shows', 'showing', 'show', 'there',
  'here', 'has', 'have', 'contains', 'depicts', 'appears', 'seems', 'some', 'into',
  'tags', 'tag', 'description', 'json', 'array', 'keywords', 'object', 'response',
  'dan', 'atau', 'yang', 'di', 'ke', 'dari', 'ini', 'itu', 'sebuah', 'dengan',
  'gambar', 'foto', 'adalah', 'pada', 'untuk', 'ada', 'terdapat',
])

function normalizeTags(arr) {
  if (!Array.isArray(arr)) return []
  const seen = new Set()
  const out = []
  for (const t of arr) {
    const clean = String(t).toLowerCase().trim().replace(/^["'#]+|["'.,;]+$/g, '')
    if (!clean || seen.has(clean)) continue
    seen.add(clean)
    out.push(clean)
    if (out.length >= 15) break
  }
  return out
}

// Last-resort: pull keyword-ish tokens out of arbitrary text.
function keywordsFromText(text) {
  // Remove JSON punctuation/braces so leftover prose is cleaner.
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

/**
 * Best-effort parse of a model response into { tags, description, ocr_text }.
 * Tries, in order:
 *   1. JSON inside a ```json fence
 *   2. The first {...} JSON block anywhere in the text
 *   3. Falls back to extracting keyword tokens from plain text
 * Never throws; returns null only when nothing usable could be found.
 */
function parseModelJson(text) {
  if (!text || !text.trim()) return null
  const raw = text.trim()

  // Candidate JSON strings to attempt, most-specific first.
  const candidates = []
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) candidates.push(fence[1].trim())
  const brace = raw.match(/\{[\s\S]*\}/)
  if (brace) candidates.push(brace[0])
  if (raw.startsWith('{')) candidates.push(raw)

  for (const c of candidates) {
    try {
      const obj = JSON.parse(c)
      const tags = normalizeTags(obj.tags)
      if (tags.length) {
        return {
          tags,
          description: typeof obj.description === 'string' ? obj.description : '',
          ocr_text:
            obj.ocr_text &&
            String(obj.ocr_text).trim() &&
            String(obj.ocr_text).trim().toLowerCase() !== 'null'
              ? String(obj.ocr_text).trim()
              : null,
        }
      }
      // Parsed JSON but no usable tags array — keep trying / fall through.
    } catch {
      // Not valid JSON, try the next candidate.
    }
  }

  // Fallback: treat the whole response as free text and mine keywords.
  const tags = keywordsFromText(raw)
  if (!tags.length) return null
  return {
    tags,
    description: firstSentence(raw),
    ocr_text: null,
    fallback: true,
  }
}

// ---------------- Provider callers ----------------

async function callGemini(model, base64, mimeType) {
  if (!GEMINI_KEY) {
    const e = new Error('VITE_GEMINI_API_KEY belum di-set')
    e.skip = true
    throw e
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_KEY,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
    }),
  })

  if (res.status === 429) {
    const e = new Error('rate limited')
    e.rateLimited = true
    throw e
  }
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${await res.text().catch(() => '')}`)
  }
  const data = await res.json()
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
  return text
}

async function callOpenRouter(model, base64, mimeType) {
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
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
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
  // OpenRouter can also return an error object with 200 in rare cases.
  if (data?.error) {
    const msg = data.error.message || 'openrouter error'
    if (/rate|limit|quota/i.test(msg)) {
      const e = new Error(msg)
      e.rateLimited = true
      throw e
    }
    throw new Error(msg)
  }
  return data?.choices?.[0]?.message?.content || ''
}

// ---------------- Main entry ----------------

/**
 * Tag one image. base64 = raw base64 (no data: prefix).
 * Returns { tags, description, ocr_text, model } on success.
 * Throws RateLimitExhaustedError when every model is rate-limited.
 */
export async function tagImage(base64, mimeType = 'image/jpeg') {
  let sawRateLimit = false

  for (const model of MODELS) {
    if (usage[model.id].exhausted) continue

    try {
      const raw =
        model.provider === 'gemini'
          ? await callGemini(model, base64, mimeType)
          : await callOpenRouter(model, base64, mimeType)

      // Debug: surface exactly what the model returned.
      console.log(`[tagger] ${model.label} raw response:`, raw)

      const parsed = parseModelJson(raw)
      if (!parsed || !parsed.tags.length) {
        // Only here if even the free-text keyword fallback found nothing.
        console.warn(`[tagger] ${model.label} returned no usable tags, trying next`, raw)
        continue
      }

      if (parsed.fallback) {
        console.info(`[tagger] ${model.label} output was not valid JSON; used text fallback`, parsed.tags)
      }

      usage[model.id].used += 1
      return { ...parsed, model: model.id, modelLabel: model.label }
    } catch (err) {
      if (err.skip) {
        // Missing key for this provider — skip silently to next model.
        continue
      }
      if (err.rateLimited) {
        usage[model.id].exhausted = true
        sawRateLimit = true
        console.warn(`[tagger] ${model.label} rate limited, falling through`)
        continue
      }
      // Generic error: log and try the next model.
      console.warn(`[tagger] ${model.label} error:`, err.message)
      continue
    }
  }

  if (sawRateLimit && allExhausted()) {
    throw new RateLimitExhaustedError()
  }
  if (allExhausted()) {
    throw new RateLimitExhaustedError()
  }
  // No model produced usable output but not strictly rate-limited.
  throw new Error('Tidak ada model yang berhasil memberi tag.')
}
