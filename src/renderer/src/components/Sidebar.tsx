import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Target,
  CalendarDays,
  Calendar,
  FileText,
  BarChart2,
  LineChart as LineChartIcon,
  Settings,
} from 'lucide-react'

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', to: '/today' },
  { icon: Target, label: 'Goals', to: '/goals' },
  { icon: CalendarDays, label: 'Plan', to: '/plan' },
  { icon: FileText, label: 'Daily Report', to: '/report/daily' },
  { icon: BarChart2, label: 'Weekly Report', to: '/report/weekly' },
  { icon: Calendar, label: 'Year Report', to: '/report/yearly' },
  { icon: LineChartIcon, label: 'Analytics', to: '/analytics' },
]

export default function Sidebar(): React.JSX.Element {
  return (
    <aside
      style={{ width: 200, minWidth: 200 }}
      className="h-screen flex flex-col bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] shrink-0"
    >
      <div className="px-5 pt-6 pb-4">
        <span className="font-mono text-xs font-semibold tracking-widest text-[var(--text-muted)] uppercase">
          ExecOS
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
        <NavLink
          to="/setup"
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2 rounded text-sm cursor-pointer transition-colors no-underline ${
              isActive
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-transparent'
            }`
          }
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span>Settings</span>
        </NavLink>
      </div>
    </aside>
  )
}
