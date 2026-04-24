import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  Target,
  Calendar,
  Smartphone,
  Briefcase,
  History,
  FileText,
  BarChart2,
  LineChart as LineChartIcon,
  Settings,
  Users,
} from 'lucide-react'

export default function Sidebar(): React.JSX.Element {
  const { t } = useTranslation()
  const NAV_ITEMS = [
    { icon: LayoutDashboard, label: t('nav.dashboard'), to: '/today' },
    { icon: Target, label: t('nav.goals'), to: '/goals' },
    { icon: Briefcase, label: t('nav.business'), to: '/business' },
    { icon: FileText, label: t('nav.dailyReport'), to: '/report/daily' },
    { icon: BarChart2, label: t('nav.reports'), to: '/reports' },
    { icon: History, label: t('nav.history'), to: '/history' },
    { icon: LineChartIcon, label: t('nav.analytics'), to: '/analytics' },
    { icon: Users, label: t('nav.team'), to: '/team' },
  ]
  const COMING_SOON = [
    { icon: Calendar, label: t('nav.googleCalendar') },
    { icon: Target, label: t('nav.missionVision') },
    { icon: Smartphone, label: t('nav.mobileApp') },
  ]

  return (
    <aside
      style={{ width: 200, minWidth: 200 }}
      className="h-screen flex flex-col bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] shrink-0"
    >
      <div className="px-5 pt-6 pb-4">
        <span className="font-mono text-xs font-semibold tracking-widest text-[var(--text-muted)] uppercase">
          Execd
        </span>
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {NAV_ITEMS.map(({ icon: Icon, label, to }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded text-sm cursor-pointer transition-colors no-underline ${
                isActive
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-transparent'
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-5">
        <div className="mx-3 my-2 border-t border-[var(--border-subtle)]" />
        <p className="px-3 py-1 text-[9px] font-mono text-[var(--text-secondary)] uppercase tracking-widest">
          {t('nav.comingSoon')}
        </p>
        {COMING_SOON.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2.5 px-3 py-2 rounded text-sm text-[var(--text-secondary)] border border-transparent opacity-70 cursor-not-allowed"
          >
            <item.icon className="w-4 h-4 shrink-0" />
            <span>{item.label}</span>
            <span className="ml-auto text-[9px] font-mono text-[var(--text-secondary)] bg-[var(--bg-hover)] px-1.5 py-0.5 rounded">
              soon
            </span>
          </div>
        ))}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2 rounded text-sm cursor-pointer transition-colors no-underline ${
              isActive
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-transparent'
            }`
          }
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span>{t('nav.settings')}</span>
        </NavLink>
      </div>
    </aside>
  )
}
