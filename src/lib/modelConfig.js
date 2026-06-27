// ============================================================
// modelConfig.js — Source of truth for every AI tagging model.
//
// Persisted in localStorage under MODEL_CONFIG_KEY. On first read the
// DEFAULT_MODELS list is used and env vars are injected as the default
// apiKey for any model whose apiKey is still empty. Users can override
// every field (model id, key, quota, order, enabled) from Settings →
// AI Models; saving dispatches 'modelconfig:updated' so the QuotaBar and
// tagger pick up changes immediately.
// ============================================================

export const MODEL_CONFIG_KEY = 'photo-catalog-model-config'
export const MODEL_CONFIG_EVENT = 'modelconfig:updated'

export const DEFAULT_MODELS = [
  {
    id: 'gemini',
    enabled: true,
    provider: 'gemini',
    name: 'Gemini',
    modelId: 'gemini-3-flash-preview',
    apiKey: '', // dari env VITE_GEMINI_API_KEY sebagai default
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{modelId}:generateContent',
    quota: 500,
    description: 'Google Gemini - Best quality, 500 req/day free',
    order: 1,
  },
  {
    id: 'openrouter',
    enabled: true,
    provider: 'openrouter',
    name: 'OpenRouter',
    modelId: 'openrouter/free',
    apiKey: '', // dari env VITE_OPENROUTER_API_KEY
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    quota: 200,
    description: 'OpenRouter Auto Free - Auto-selects best free vision model',
    order: 2,
  },
  {
    id: 'groq',
    enabled: true,
    provider: 'groq',
    name: 'Groq',
    modelId: 'meta-llama/llama-4-scout-17b-16e-instruct',
    apiKey: '', // dari env VITE_GROQ_API_KEY
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    quota: 100,
    description: 'Groq - Ultra fast inference, 100 req/day free',
    order: 3,
  },
  {
    id: 'hf',
    enabled: true,
    provider: 'huggingface',
    name: 'HF BLIP',
    modelId: 'Salesforce/blip-image-captioning-large',
    apiKey: '', // dari env VITE_HF_API_KEY
    endpoint: 'https://api-inference.huggingface.co/models/{modelId}',
    quota: 300,
    description: 'HuggingFace BLIP - Image captioning, 300 req/hour free',
    order: 4,
  },
  {
    id: 'gemma',
    enabled: true,
    provider: 'openrouter',
    name: 'Gemma',
    modelId: 'google/gemma-4-31b-it:free',
    apiKey: '', // pakai VITE_OPENROUTER_API_KEY
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    quota: 200,
    description: 'Gemma 4 31B - Google open model via OpenRouter',
    order: 5,
  },
]

// Which env var supplies the default apiKey for a given model id.
const ENV_KEY_BY_ID = {
  gemini: 'VITE_GEMINI_API_KEY',
  openrouter: 'VITE_OPENROUTER_API_KEY',
  groq: 'VITE_GROQ_API_KEY',
  hf: 'VITE_HF_API_KEY',
  gemma: 'VITE_OPENROUTER_API_KEY',
}

/** The env-provided key for a model id (empty string when unset). */
export function envKeyFor(id) {
  const name = ENV_KEY_BY_ID[id]
  return (name && import.meta.env[name]) || ''
}

/** The env var NAME for a model id, for placeholder hints in the UI. */
export function envVarName(id) {
  return ENV_KEY_BY_ID[id] || null
}

// Inject env keys as the default for any model whose apiKey is still empty.
// Returns a fresh array of fresh objects (never mutates the input).
function injectEnvKeys(models) {
  return models.map((m) => ({
    ...m,
    apiKey: m.apiKey && m.apiKey.trim() ? m.apiKey : envKeyFor(m.id),
  }))
}

function readStored() {
  try {
    const raw = localStorage.getItem(MODEL_CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length ? parsed : null
  } catch {
    return null
  }
}

/**
 * Full model config (all models, enabled or not), sorted by order.
 * Falls back to DEFAULT_MODELS with env keys injected when nothing is stored.
 * Env keys are injected for any model whose stored apiKey is empty, so adding
 * a key to .env continues to work without re-saving in Settings.
 */
export function getModelConfig() {
  const stored = readStored()
  const base = stored || DEFAULT_MODELS
  return injectEnvKeys(base).sort((a, b) => (a.order || 0) - (b.order || 0))
}

/**
 * Raw stored config for the editor: stored values as-is (apiKey stays empty
 * when relying on an env var), sorted by order. Falls back to DEFAULT_MODELS.
 * Use this in Settings so empty key fields show the "using env" placeholder
 * instead of leaking the injected env secret into the input.
 */
export function getRawModelConfig() {
  const stored = readStored()
  const base = stored || DEFAULT_MODELS
  return base.map((m) => ({ ...m })).sort((a, b) => (a.order || 0) - (b.order || 0))
}

/** Persist the given models and notify listeners (QuotaBar, tagger). */
export function saveModelConfig(models) {
  try {
    localStorage.setItem(MODEL_CONFIG_KEY, JSON.stringify(models))
  } catch {
    /* ignore (private mode / quota) */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MODEL_CONFIG_EVENT))
  }
}

/** Enabled models only, sorted by order — the live tagging fallback chain. */
export function getEnabledModels() {
  return getModelConfig().filter((m) => m.enabled)
}

/** Find a single model by id (with env key injected). */
export function getModelById(id) {
  return getModelConfig().find((m) => m.id === id) || null
}

/** Patch a single model, persist, and dispatch the update event. */
export function updateModel(id, changes) {
  const next = getModelConfig().map((m) => (m.id === id ? { ...m, ...changes } : m))
  saveModelConfig(next)
  return next
}

/** A single model's default config (env key injected), or null. */
export function defaultModel(id) {
  const d = DEFAULT_MODELS.find((m) => m.id === id)
  return d ? { ...d, apiKey: envKeyFor(id) } : null
}
