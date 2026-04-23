import React, { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const DAY_LABELS: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
}
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export default function Setup(): React.JSX.Element {
  const navigate = useNavigate()
  const [apiKey, setApiKey] = useState('')
  const [workingStart, setWorkingStart] = useState('09:00')
  const [workingEnd, setWorkingEnd] = useState('18:00')
  const [breakStart, setBreakStart] = useState('13:00')
  const [breakEnd, setBreakEnd] = useState('14:00')
  const [workingDays, setWorkingDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri'])
  const [showKey, setShowKey] = useState(false)
  const [formError, setFormError] = useState('')
  const [businessGoalCount, setBusinessGoalCount] = useState(3)
  const [personalGoalCount, setPersonalGoalCount] = useState(1)
  const [familyGoalCount, setFamilyGoalCount] = useState(1)
  const [maxDailyTasks, setMaxDailyTasks] = useState(5)
  const [fiscalYearStart, setFiscalYearStart] = useState(4)
  const { error, success } = useToast()

  useEffect(() => {
    async function hydrateConfig(): Promise<void> {
      const config = (await window.api.config.get()) as Record<string, unknown> | null
      if (!config) return
      setApiKey((config.api_key_encrypted as string) ?? '')
      setWorkingStart((config.working_start as string) ?? '09:00')
      setWorkingEnd((config.working_end as string) ?? '18:00')
      setBreakStart((config.break_start as string) ?? '13:00')
      setBreakEnd((config.break_end as string) ?? '14:00')
      setWorkingDays((config.working_days as string[]) ?? ['mon', 'tue', 'wed', 'thu', 'fri'])
      setBusinessGoalCount(Number(config.business_goal_count ?? 3))
      setPersonalGoalCount(Number(config.personal_goal_count ?? 1))
      setFamilyGoalCount(Number(config.family_goal_count ?? 1))
      setMaxDailyTasks(Number(config.max_daily_tasks ?? 5))
      setFiscalYearStart(Number(config.fiscal_year_start ?? 4))
    }
    hydrateConfig()
  }, [])

  function toggleDay(day: string): void {
    setWorkingDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
  }

  function validate(): boolean {
    if (!apiKey.trim()) {
      setFormError('API key is required.')
      return false
    }
    if (workingDays.length === 0) {
      setFormError('Select at least one working day.')
      return false
    }
    if (workingStart >= workingEnd) {
      setFormError('Working end time must be after start time.')
      return false
    }
    if (businessGoalCount < 3 || personalGoalCount < 1 || familyGoalCount < 1) {
      setFormError('Minimum goals: 3 business, 1 personal, 1 family.')
      return false
    }
    setFormError('')
    return true
  }

  async function handleSave(): Promise<void> {
    if (!validate()) return
    try {
      await window.api.config.save({
        api_key: apiKey,
        working_start: workingStart,
        working_end: workingEnd,
        working_days: workingDays,
        break_start: breakStart,
        break_end: breakEnd,
        business_goal_count: businessGoalCount,
        personal_goal_count: personalGoalCount,
        family_goal_count: familyGoalCount,
        max_daily_tasks: maxDailyTasks,
        fiscal_year_start: fiscalYearStart,
      })
      const profile = await window.api.business.get()
      if (!profile || !profile.business_name) {
        navigate('/business/setup')
      } else {
        success('Settings saved.')
      }
    } catch {
      error('Failed to save settings.')
    }
  }

  function triggerCsvDownload(csv: string, filename: string): void {
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleDownloadTaskHistory(): Promise<void> {
    try {
      const result = await window.api.reports.exportTasksCsv({})
      if (!result.success) {
        error('Failed to export tasks CSV.')
        return
      }
      triggerCsvDownload(result.csv, result.filename)
      success('Tasks CSV exported.')
    } catch {
      error('Failed to export tasks CSV.')
    }
  }

  async function handleDownloadDailySummary(): Promise<void> {
    try {
      const result = await window.api.reports.exportSummaryCsv({})
      if (!result.success) {
        error('Failed to export summary CSV.')
        return
      }
      triggerCsvDownload(result.csv, result.filename)
      success('Summary CSV exported.')
    } catch {
      error('Failed to export summary CSV.')
    }
  }
  const fiscalYearEnd = ((fiscalYearStart - 2 + 12) % 12) + 1

  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--bg-base)] p-5">
      <div className="mx-auto bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 w-full max-w-5xl mb-6">
        <div className="mb-4">
          <p className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase mb-1">
            Execd
          </p>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Setup</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Configure your API key and work schedule.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <section className="space-y-4">
            <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-5">
              <p className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">
                Financial Year
              </p>
              <p className="text-xs text-[var(--text-muted)] mb-3">
                Select the month your financial year starts
              </p>
              <select
                value={fiscalYearStart}
                onChange={(e) => setFiscalYearStart(Number(e.target.value))}
                className="bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--border-active)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none w-full cursor-pointer"
              >
                <option value={1}>January (Jan – Dec)</option>
                <option value={2}>February (Feb – Jan)</option>
                <option value={3}>March (Mar – Feb)</option>
                <option value={4}>April (Apr – Mar) — Indian FY</option>
                <option value={5}>May (May – Apr)</option>
                <option value={6}>June (Jun – May)</option>
                <option value={7}>July (Jul – Jun)</option>
                <option value={8}>August (Aug – Jul)</option>
                <option value={9}>September (Sep – Aug)</option>
                <option value={10}>October (Oct – Sep)</option>
                <option value={11}>November (Nov – Oct)</option>
                <option value={12}>December (Dec – Nov)</option>
              </select>
              <p className="text-xs text-[var(--text-muted)] mt-2">
                Your financial year runs {MONTH_NAMES[fiscalYearStart - 1]} →{' '}
                {MONTH_NAMES[fiscalYearEnd - 1]}
              </p>
            </div>
            <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg p-4 space-y-3">
              <label className="block text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest">
                Working Schedule
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-[var(--text-secondary)] mb-1">Working Hours</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={workingStart}
                      onChange={(e) => setWorkingStart(e.target.value)}
                      className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-2.5 py-2 text-sm text-[var(--text-primary)] outline-none"
                    />
                    <span className="text-[var(--text-secondary)] text-xs">to</span>
                    <input
                      type="time"
                      value={workingEnd}
                      onChange={(e) => setWorkingEnd(e.target.value)}
                      className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-2.5 py-2 text-sm text-[var(--text-primary)] outline-none"
                    />
                  </div>
                </div>

                <div>
                  <p className="text-xs text-[var(--text-secondary)] mb-1">Break Time</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={breakStart}
                      onChange={(e) => setBreakStart(e.target.value)}
                      className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-2.5 py-2 text-sm text-[var(--text-primary)] outline-none"
                    />
                    <span className="text-[var(--text-secondary)] text-xs">to</span>
                    <input
                      type="time"
                      value={breakEnd}
                      onChange={(e) => setBreakEnd(e.target.value)}
                      className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-2.5 py-2 text-sm text-[var(--text-primary)] outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs text-[var(--text-secondary)] mb-1.5">Working Days</p>
                <div className="flex gap-1.5 flex-wrap">
                  {DAYS.map((day) => (
                    <button
                      key={day}
                      onClick={() => toggleDay(day)}
                      className={`px-3 py-1.5 rounded text-xs font-mono cursor-pointer transition-colors ${
                        workingDays.includes(day)
                          ? 'bg-[var(--accent-blue)] text-white border border-[var(--accent-blue)]'
                          : 'bg-transparent border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)]'
                      }`}
                    >
                      {DAY_LABELS[day]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg p-4 space-y-3">
              <label className="block text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest">
                Monthly Goal Slots
              </label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-[var(--text-secondary)] mb-1">Business</p>
                  <input
                    type="number"
                    min={3}
                    value={businessGoalCount}
                    onChange={(e) => setBusinessGoalCount(Math.max(3, Number(e.target.value) || 3))}
                    className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                  />
                </div>
                <div>
                  <p className="text-xs text-[var(--text-secondary)] mb-1">Personal</p>
                  <input
                    type="number"
                    min={1}
                    value={personalGoalCount}
                    onChange={(e) => setPersonalGoalCount(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                  />
                </div>
                <div>
                  <p className="text-xs text-[var(--text-secondary)] mb-1">Family</p>
                  <input
                    type="number"
                    min={1}
                    value={familyGoalCount}
                    onChange={(e) => setFamilyGoalCount(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                  />
                </div>
              </div>
              <p className="text-[var(--text-muted)] text-xs">
                Minimum: 3 business, 1 personal, 1 family.
              </p>
            </div>
            <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg p-4 space-y-3">
              <label className="block text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest">
                Daily Task Limit
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {[5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((value) => (
                  <button
                    key={value}
                    onClick={() => setMaxDailyTasks(value)}
                    className={`font-mono text-xs px-3 py-1.5 rounded transition-colors ${
                      maxDailyTasks === value
                        ? 'bg-[var(--accent-blue)] text-white border border-[var(--accent-blue)]'
                        : 'bg-transparent border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)] cursor-pointer'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <section className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg p-4 space-y-3 self-end">
              <div>
                <label className="block text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest mb-2">
                  API Key
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--border-active)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors pr-10"
                  />
                  <button
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[var(--text-muted)] text-xs mt-1.5">
                  Stored encrypted on your machine. Never sent anywhere else.
                </p>
              </div>
            </section>
          </section>
        </div>

        {formError && <p className="text-sm text-[var(--accent-red)] mt-3">{formError}</p>}

        <div className="pt-4">
          <button
            onClick={handleSave}
            className="w-full xl:w-auto xl:min-w-56 bg-(--accent-blue) hover:bg-[--accent-blue-dim] text-white font-medium py-2.5 px-6 rounded text-sm cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save Settings
          </button>
        </div>
        <div className="pt-4">
          <p className="block text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest mb-2">
            Data
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={handleDownloadTaskHistory}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors underline"
            >
              Download Task History
            </button>
            <button
              onClick={handleDownloadDailySummary}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors underline"
            >
              Download Daily Summary
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
