import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, KeyRound } from 'lucide-react'

// Bar color by remaining fraction (or red when exhausted).
function barColor(remaining, quota, exhausted) {
  if (exhausted) return 'var(--failed)'
  const pct = quota ? remaining / quota : 0
  if (pct < 0.1) return 'var(--failed)'
  if (pct < 0.5) return 'var(--pending)'
  return 'var(--tagged)'
}

export default function QuotaBar({ getStats }) {
  const [stats, setStats] = useState(() => (getStats ? getStats() : null))

  const refresh = useCallback(() => {
    if (getStats) setStats(getStats())
  }, [getStats])

  useEffect(() => {
    refresh()
    const onUpdate = () => refresh()
    window.addEventListener('tagger:usage-update', onUpdate)
    const iv = setInterval(refresh, 30000) // auto-refresh every 30s
    return () => {
      window.removeEventListener('tagger:usage-update', onUpdate)
      clearInterval(iv)
    }
  }, [refresh])

  if (!stats) return null

  return (
    <div className="quota-bar">
      <div className="quota-bar__models">
        {stats.models.map((m) => {
          const usedPct = m.quota ? Math.min(100, Math.round((m.used / m.quota) * 100)) : 0
          const color = barColor(m.remaining, m.quota, m.exhausted)
          return (
            <div
              key={m.id}
              className={`quota-model${m.available ? '' : ' quota-model--off'}`}
              title={m.available ? `${m.name}: ${m.used}/${m.quota} terpakai` : `${m.name}: tidak ada API key`}
            >
              <div className="quota-model__top">
                <span className="quota-model__name">
                  {!m.available && <KeyRound size={11} />}
                  {m.short}
                </span>
                <span className="quota-model__count">
                  {!m.available
                    ? 'no key'
                    : m.exhausted
                      ? 'exhausted'
                      : `${m.used} / ${m.quota}`}
                </span>
              </div>
              <div className="quota-model__track">
                <div
                  className="quota-model__fill"
                  style={{ width: m.available ? `${usedPct}%` : '0%', background: color }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="quota-bar__total">
        <span>~{stats.totalRemaining} tag tersisa hari ini</span>
        <button type="button" className="icon-btn" onClick={refresh} title="Refresh kuota">
          <RefreshCw size={14} />
        </button>
      </div>
    </div>
  )
}
