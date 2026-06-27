// ============================================================
// ModelSettings.jsx — the "AI Models" tab inside SettingsModal.
// Edits a local working copy of the model config; "Simpan Perubahan"
// persists via saveModelConfig() which notifies the QuotaBar + tagger.
// ============================================================

import { useState } from 'react'
import { Eye, EyeOff, Loader2, RotateCcw, FlaskConical, Save, Check, X as XIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import {
  getRawModelConfig,
  saveModelConfig,
  DEFAULT_MODELS,
  envKeyFor,
  envVarName,
} from '../lib/modelConfig'
import { testModel } from '../lib/tagger'
import { ModelIconFor } from './QuotaBar'
import { showToast } from './Toast'

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/10 dark:bg-navy-800 dark:text-white'

// On/off switch matching the app's brand toggle style.
function Switch({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-brand-500' : 'bg-gray-300 dark:bg-navy-600',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

function ModelCard({ model, onChange, onReset }) {
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState(null) // { ok, message }

  const Icon = ModelIconFor(model)
  const envName = envVarName(model.id)
  const hasEnvKey = !!envKeyFor(model.id)
  const keyPlaceholder =
    !model.apiKey && hasEnvKey && envName ? `Using env variable (${envName})` : 'sk-... / AIza...'

  const set = (changes) => onChange({ ...model, ...changes })

  const runTest = async () => {
    setTesting(true)
    setResult(null)
    // Effective key: explicit override, else env default.
    const effective = { ...model, apiKey: model.apiKey || envKeyFor(model.id) }
    const r = await testModel(effective)
    setResult(r)
    setTesting(false)
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-navy-900',
        !model.enabled && 'opacity-50',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && (
            <span className="shrink-0">
              <Icon />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{model.name}</span>
              <span className="rounded bg-brand-500/10 px-1.5 py-0.5 font-mono text-[10px] text-brand-500">
                {model.modelId}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-400">{model.description}</p>
          </div>
        </div>
        <Switch checked={model.enabled} onChange={(v) => set({ enabled: v })} />
      </div>

      {/* Fields */}
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500 dark:text-gray-300">
          Model ID
          <input
            className={inputClass}
            value={model.modelId}
            placeholder={DEFAULT_MODELS.find((d) => d.id === model.id)?.modelId || ''}
            onChange={(e) => set({ modelId: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500 dark:text-gray-300">
          API Key
          <div className="relative">
            <input
              className={cn(inputClass, 'pr-10')}
              type={showKey ? 'text' : 'password'}
              value={model.apiKey}
              placeholder={keyPlaceholder}
              autoComplete="off"
              onChange={(e) => set({ apiKey: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-brand-500"
              aria-label={showKey ? 'Sembunyikan key' : 'Tampilkan key'}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-gray-500 dark:text-gray-300">
            Quota/day
            <input
              className={inputClass}
              type="number"
              min="0"
              value={model.quota}
              onChange={(e) => set({ quota: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-gray-500 dark:text-gray-300">
            Order
            <input
              className={inputClass}
              type="number"
              min="1"
              max="10"
              value={model.order}
              onChange={(e) => set({ order: Number(e.target.value) || 1 })}
            />
          </label>
        </div>
      </div>

      {/* Footer actions */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onReset(model.id)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-navy-700 dark:hover:text-white"
        >
          <RotateCcw size={13} /> Reset to Default
        </button>
        <div className="flex items-center gap-2">
          {result && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium',
                result.ok ? 'text-emerald-500' : 'text-red-500',
              )}
            >
              {result.ok ? <Check size={13} /> : <XIcon size={13} />}
              {result.ok ? 'Working' : `Error: ${result.message}`}
            </span>
          )}
          <button
            type="button"
            onClick={runTest}
            disabled={testing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500/40 px-3 py-1.5 text-xs font-semibold text-brand-500 transition hover:bg-brand-500/10 disabled:opacity-50"
          >
            {testing ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
            Test Model
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ModelSettings() {
  const [models, setModels] = useState(() => getRawModelConfig())

  const updateOne = (next) =>
    setModels((list) => list.map((m) => (m.id === next.id ? next : m)))

  const resetOne = (id) => {
    if (!window.confirm('Reset model ini ke pengaturan default?')) return
    const def = DEFAULT_MODELS.find((d) => d.id === id)
    if (def) setModels((list) => list.map((m) => (m.id === id ? { ...def } : m)))
  }

  const save = () => {
    // Persist sorted by order so the live chain matches the editor.
    const sorted = [...models].sort((a, b) => (a.order || 0) - (b.order || 0))
    saveModelConfig(sorted)
    setModels(sorted)
    showToast('Konfigurasi disimpan', 'success')
  }

  const resetAll = () => {
    if (!window.confirm('Reset SEMUA model ke pengaturan default?')) return
    const fresh = DEFAULT_MODELS.map((m) => ({ ...m }))
    setModels(fresh)
    saveModelConfig(fresh)
    showToast('Semua model di-reset ke default', 'info')
  }

  const ordered = [...models].sort((a, b) => (a.order || 0) - (b.order || 0))

  return (
    <div className="mt-5">
      <h3 className="text-base font-bold">Konfigurasi Model AI</h3>
      <p className="mt-0.5 text-sm text-gray-400">
        Atur provider, model ID, dan API key untuk tagging otomatis
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {ordered.map((m) => (
          <ModelCard key={m.id} model={m} onChange={updateOne} onReset={resetOne} />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={resetAll}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium text-red-500 transition hover:bg-red-500/10"
        >
          <RotateCcw size={15} /> Reset Semua ke Default
        </button>
        <button
          type="button"
          onClick={save}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:-translate-y-0.5"
        >
          <Save size={15} /> Simpan Perubahan
        </button>
      </div>
    </div>
  )
}
