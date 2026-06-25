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
    id: 'google/gemma-4-31b-it:free',
    label: 'Gemma 4 31B',
    provider: 'openrouter',
    dailyLimit: 200,
  },
  {
    id: 'meta-llama/llama-4-scout:free',
    label: 'Llama 4 Scout',
    provider: 'openrouter',
    dailyLimit: 200,
  },
  {
    id: 'google/gemma-3-27b-it:free',
    label: 'Gemma 3 27B',
    provider: 'openrouter',
    dailyLimit: 200,
  },
  {
    id: 'mistralai/mistral-small-3.1-24b-instruct:free',
    label: 'Mistral Small 3.1 24B',
    provider: 'openrouter',
    dailyLimit: 200,
  },
  {
    id: 'google/gemma-3-12b-it:free',
    label: 'Gemma 3 12B',
    provider: 'openrouter',
    dailyLimit: 200,
  },
  {
    id: 'deepseek/deepseek-chat-v3.1:free',
    label: 'DeepSeek Chat v3.1',
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
function parseModelJson(text) {
  if (!text) return null
  let s = text.trim()
  // Strip ```json ... ``` or ``` ... ``` fences.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  // Otherwise grab the first {...} block.
  if (!s.startsWith('{')) {
    const brace = s.match(/\{[\s\S]*\}/)
    if (brace) s = brace[0]
  }
  try {
    const obj = JSON.parse(s)
    return {
      tags: Array.isArray(obj.tags)
        ? obj.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 15)
        : [],
      description: typeof obj.description === 'string' ? obj.description : '',
      ocr_text:
        obj.ocr_text && String(obj.ocr_text).trim() && String(obj.ocr_text).trim().toLowerCase() !== 'null'
          ? String(obj.ocr_text).trim()
          : null,
    }
  } catch {
    return null
  }
}

// ---------------- Provider callers ----------------

async function callGemini(model, base64, mimeType) {
  if (!GEMINI_KEY) {
    const e = new Error('VITE_GEMINI_API_KEY belum di-set')
    e.skip = true
    throw e
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${GEMINI_KEY}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

      const parsed = parseModelJson(raw)
      if (!parsed || !parsed.tags.length) {
        // Treat unparseable output as a soft failure; try next model.
        console.warn(`[tagger] ${model.label} returned unusable output, trying next`)
        continue
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
