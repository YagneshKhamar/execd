import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { applyTheme, getStoredTheme, type Theme } from '../theme'

export default function ThemeToggle(): React.JSX.Element {
  const { t } = useTranslation()
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme())

  function toggle(): void {
    const next: Theme = theme === 'violet' ? 'light' : 'violet'
    applyTheme(next)
    setTheme(next)
  }

  const Icon = theme === 'violet' ? Sun : Moon
  return (
    <button
      onClick={toggle}
      title={theme === 'violet' ? t('nav.lightMode') : t('nav.darkMode')}
      className="bg-transparent border-none text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer p-1"
    >
      <Icon className="w-4 h-4" />
    </button>
  )
}
