import type { TFunction } from 'i18next'

/** "just now" / "5m ago" / "3h ago" / "2d ago", translated. */
export function relativeTime(t: TFunction, iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 45) return t('time.justNow')
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return t('time.minutesAgo', { count: minutes })
  const hours = Math.round(minutes / 60)
  return hours < 24
    ? t('time.hoursAgo', { count: hours })
    : t('time.daysAgo', { count: Math.round(hours / 24) })
}
