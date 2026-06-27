import { useCallback, useEffect, useState } from 'react'

const THEME_KEY = 'photo-catalog-theme'

function readStoredTheme() {
  if (typeof localStorage === 'undefined') return 'dark'
  return localStorage.getItem(THEME_KEY) || 'dark'
}

/** Apply (or remove) the `dark` class on <html> so Tailwind's class strategy works. */
function applyTheme(theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (theme === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
}

// Apply once at module load so there is no flash before React mounts.
applyTheme(readStoredTheme())

export function useTheme() {
  const [theme, setTheme] = useState(readStoredTheme)

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggleTheme, isDark: theme === 'dark' }
}
