export type Theme = 'light' | 'violet'

const STORAGE_KEY = 'execd-theme'

export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'violet' ? 'violet' : 'light'
  } catch {
    return 'light'
  }
}

const TITLE_BAR: Record<Theme, { color: string; symbolColor: string }> = {
  light: { color: '#eef1f5', symbolColor: '#475569' },
  violet: { color: '#100c1d', symbolColor: '#a199c9' },
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  const bar = TITLE_BAR[theme]
  window.api.window?.setTitleBar(bar.color, bar.symbolColor)?.catch(() => {})
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // theme still applies for this session
  }
}
