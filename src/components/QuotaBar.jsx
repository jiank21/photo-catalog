import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, KeyRound } from 'lucide-react'
import { cn } from '../lib/cn'
import { getModelConfig, MODEL_CONFIG_EVENT } from '../lib/modelConfig'
import { getUsageToday } from '../lib/tagger'

// ---------------- Provider brand icons (inline SVG) ----------------
const GeminiIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M12 2L13.5 9.5L21 11L13.5 12.5L12 20L10.5 12.5L3 11L10.5 9.5L12 2Z" fill="url(#gemini-grad)" />
    <defs>
      <linearGradient id="gemini-grad" x1="0" y1="0" x2="24" y2="24">
        <stop offset="0%" stopColor="#4285f4" />
        <stop offset="100%" stopColor="#34a853" />
      </linearGradient>
    </defs>
  </svg>
)

const GroqIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="#f55036" />
    <path d="M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0zm4-2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" fill="white" />
  </svg>
)

const OpenRouterIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="6" fill="#6467f2" />
    <path d="M7 8h10M7 12h7M7 16h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const HuggingFaceIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="#FFD21E" />
    <circle cx="9" cy="10" r="1.5" fill="#333" />
    <circle cx="15" cy="10" r="1.5" fill="#333" />
    <path d="M8 14s1 2 4 2 4-2 4-2" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

const GemmaIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="6" fill="#1a73e8" />
    <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
      G
    </text>
  </svg>
)

// Map by provider string (spec), with a per-id override so Gemma keeps its own
// badge even though its provider is "openrouter".
const PROVIDER_ICONS = {
  gemini: GeminiIcon,
  openrouter: OpenRouterIcon,
  groq: GroqIcon,
  huggingface: HuggingFaceIcon,
}
const ID_ICONS = {
  gemma: GemmaIcon,
}

export function ModelIconFor(model) {
  return ID_ICONS[model.id] || PROVIDER_ICONS[model.provider] || null
}

// Bar color by remaining fraction (or red when exhausted).
function barColor(remaining, quota, exhausted) {
  if (exhausted) return '#ef4444'
  const pct = quota ? remaining / quota : 0
  if (pct < 0.1) return '#ef4444'
  if (pct < 0.5) return '#f59e0b'
  return '#10b981'
}

export default function QuotaBar() {
  const [models, setModels] = useState(() => getModelConfig())
  const [usage, setUsage] = useState(() => getUsageToday())
  const [activeModel, setActiveModel] = useState(null)

  const refresh = useCallback(() => {
    setModels(getModelConfig())
    setUsage(getUsageToday())
  }, [])

  useEffect(() => {
    refresh()
    const onUpdate = () => refresh()
    const onActive = (e) => setActiveModel(e.detail?.modelId ?? null)
    window.addEventListener('tagger:usage-update', onUpdate)
    window.addEventListener('tagger:model-active', onActive)
    window.addEventListener(MODEL_CONFIG_EVENT, onUpdate)
    const iv = setInterval(refresh, 30000) // auto-refresh every 30s
    return () => {
      window.removeEventListener('tagger:usage-update', onUpdate)
      window.removeEventListener('tagger:model-active', onActive)
      window.removeEventListener(MODEL_CONFIG_EVENT, onUpdate)
      clearInterval(iv)
    }
  }, [refresh])

  // Derive per-card view data from config + today's usage.
  const cards = models.map((m) => {
    const used = usage.used[m.id] || 0
    const exhausted = !!usage.exhausted[m.id]
    const hasKey = !!m.apiKey
    const remaining = exhausted ? 0 : Math.max(0, m.quota - used)
    const available = m.enabled && hasKey
    return { ...m, used, exhausted, hasKey, remaining, available }
  })

  // Total tags remaining across enabled + keyed models (ignores disabled).
  const totalRemaining = cards
    .filter((c) => c.available)
    .reduce((sum, c) => sum + c.remaining, 0)

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-navy-700 dark:shadow-card-dark">
      <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {cards.map((m) => {
          const usedPct = m.quota ? Math.min(100, Math.round((m.used / m.quota) * 100)) : 0
          const color = barColor(m.remaining, m.quota, m.exhausted)
          const isActive = activeModel === m.id
          const Icon = ModelIconFor(m)
          const dimmed = !m.enabled || !m.hasKey
          return (
            <div
              key={m.id}
              className={cn(
                'relative flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 transition-all duration-200 dark:border-white/5 dark:bg-navy-900',
                dimmed && 'opacity-40',
                isActive && 'border-brand-500 ring-2 ring-brand-500/40',
              )}
              title={
                !m.enabled
                  ? `${m.name}: disabled`
                  : !m.hasKey
                    ? `${m.name}: tidak ada API key`
                    : `${m.name}: ${m.used}/${m.quota} terpakai`
              }
            >
              {isActive && (
                <span className="absolute right-2.5 top-2.5 h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              )}
              <div className="flex items-start justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 truncate font-semibold',
                      dimmed && 'text-gray-400',
                    )}
                  >
                    {Icon ? (
                      <span className={cn('shrink-0', dimmed && 'opacity-60')}>
                        <Icon />
                      </span>
                    ) : !m.hasKey ? (
                      <KeyRound size={11} />
                    ) : null}
                    {m.name}
                  </span>
                  <span className="block truncate font-mono text-[10px] opacity-60">{m.modelId}</span>
                </div>
                {!m.enabled ? (
                  <span className="shrink-0 rounded bg-gray-400/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-500">
                    Disabled
                  </span>
                ) : !m.hasKey ? (
                  <span className="shrink-0 rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400">
                    No Key
                  </span>
                ) : (
                  <span
                    className={cn(
                      'shrink-0 tabular-nums',
                      m.exhausted ? 'text-red-500' : 'text-gray-400',
                    )}
                  >
                    {m.exhausted ? 'exhausted' : `${m.used} / ${m.quota}`}
                  </span>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-navy-600">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: m.available ? `${usedPct}%` : '0%', background: color }}
                />
              </div>
              {isActive && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-500">
                  active
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 whitespace-nowrap text-sm">
        <span className="font-bold text-brand-500">~{totalRemaining}</span>
        <span className="text-gray-400">tag tersisa hari ini</span>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-brand-500 dark:hover:bg-navy-700"
          onClick={refresh}
          title="Refresh kuota"
        >
          <RefreshCw size={14} />
        </button>
      </div>
    </div>
  )
}
