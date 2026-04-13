import React, { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
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

export default function Setup(): React.JSX.Element {
  const [provider, setProvider] = useState<'openai' | 'anthropic' | 'ollama' | 'openrouter'>('openai')
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
  const [ollamaModel, setOllamaModel] = useState('llama3')
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://localhost:11434')
  const [openrouterModel, setOpenrouterModel] = useState('mistralai/mistral-7b-instruct')
  const { error, success } = useToast()

  useEffect(() => {
    async function hydrateConfig(): Promise<void> {
      const config = (await window.api.config.get()) as Record<string, unknown> | null
      if (!config) return
      setProvider(
        (config.ai_provider as 'openai' | 'anthropic' | 'ollama' | 'openrouter') ?? 'openai',
      )
      setApiKey((config.api_key_encrypted as string) ?? '')
      setWorkingStart((config.working_start as string) ?? '09:00')
      setWorkingEnd((config.working_end as string) ?? '18:00')
      setBreakStart((config.break_start as string) ?? '13:00')
      setBreakEnd((config.break_end as string) ?? '14:00')
      setWorkingDays((config.working_days as string[]) ?? ['mon', 'tue', 'wed', 'thu', 'fri'])
      setBusinessGoalCount(Number(config.business_goal_count ?? 3))
      setPersonalGoalCount(Number(config.personal_goal_count ?? 1))
      setFamilyGoalCount(Number(config.family_goal_count ?? 1))
      setOllamaModel(String(config.ollama_model ?? 'llama3'))
      setOllamaBaseUrl(String(config.ollama_base_url ?? 'http://localhost:11434'))
      setOpenrouterModel(String(config.openrouter_model ?? 'mistralai/mistral-7b-instruct'))
    }
    hydrateConfig()
  }, [])

  function toggleDay(day: string): void {
    setWorkingDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
  }

  function validate(): boolean {
    if (provider !== 'ollama' && !apiKey.trim()) {
      setFormError('API key is required.')
      return false
    }
    if (provider === 'ollama') {
      if (!ollamaBaseUrl.trim().startsWith('http')) {
        setFormError('Ollama base URL must start with http.')
        return false
      }
      if (!ollamaModel.trim()) {
        setFormError('Ollama model is required.')
        return false
      }
    }
    if (provider === 'openrouter') {
      if (!apiKey.trim()) {
        setFormError('OpenRouter API key is required.')
        return false
      }
      if (!openrouterModel.trim()) {
        setFormError('OpenRouter model is required.')
        return false
      }
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
        ai_provider: provider,
        api_key: apiKey,
        working_start: workingStart,
        working_end: workingEnd,
        working_days: workingDays,
        break_start: breakStart,
        break_end: breakEnd,
        business_goal_count: businessGoalCount,
        personal_goal_count: personalGoalCount,
        family_goal_count: familyGoalCount,
        ollama_model: ollamaModel,
        ollama_base_url: ollamaBaseUrl,
        openrouter_model: openrouterModel,
      })
      success('Settings saved.')
    } catch {
      error('Failed to save settings.')
    }
  }
  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--bg-base)] p-5">
      <div className="mx-auto bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 w-full max-w-5xl mb-6">
        <div className="mb-4">
          <p className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase mb-1">EXECOS</p>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Setup</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Configure your AI provider and schedule.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <section className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg p-4 space-y-3">
            <label className="block text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest">
              AI Provider
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['openai', 'anthropic', 'ollama', 'openrouter'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`py-2 rounded text-sm font-medium cursor-pointer transition-colors ${
                    provider === p
                      ? 'bg-[var(--bg-surface)] border border-[var(--border-active)] text-[var(--text-primary)]'
                      : 'bg-transparent border border-[var(--border-default)] text-[var(--text-secondary)]'
                  }`}
                >
                  {p === 'openai'
                    ? 'OpenAI'
                    : p === 'anthropic'
                      ? 'Anthropic'
                      : p === 'ollama'
                        ? 'Ollama (local)'
                        : 'OpenRouter'}
                </button>
              ))}
            </div>

            {provider !== 'ollama' ? (
              <div>
                <label className="block text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest mb-2">
                  API Key
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      provider === 'openai'
                        ? 'sk-...'
                        : provider === 'anthropic'
                          ? 'sk-ant-...'
                          : 'or-...'
                    }
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
            ) : (
              <p className="text-xs text-[var(--text-muted)]">
                No API key needed. Ollama must be running locally.
              </p>
            )}

            {provider === 'ollama' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest mb-2">
                    Ollama Base URL
                  </label>
                  <input
                    type="text"
                    value={ollamaBaseUrl}
                    onChange={(e) => setOllamaBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--border-active)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest mb-2">
                    Model Name
                  </label>
                  <input
                    type="text"
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.target.value)}
                    placeholder="llama3, mistral, phi3..."
                    className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--border-active)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                  />
                </div>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    window.open('https://ollama.com/library')
                  }}
                  className="text-xs text-[var(--accent-blue)] hover:underline cursor-pointer"
                >
                  Browse Ollama models ↗
                </a>
              </div>
            )}

            {provider === 'openrouter' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest mb-2">
                    Model
                  </label>
                  <input
                    type="text"
                    value={openrouterModel}
                    onChange={(e) => setOpenrouterModel(e.target.value)}
                    placeholder="mistralai/mistral-7b-instruct"
                    className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--border-active)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                  />
                </div>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    window.open('https://openrouter.ai/models')
                  }}
                  className="text-xs text-[var(--accent-blue)] hover:underline cursor-pointer"
                >
                  Browse OpenRouter models ↗
                </a>
              </div>
            )}
          </section>

          <section className="space-y-4">
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
              <p className="text-[var(--text-muted)] text-xs">Minimum: 3 business, 1 personal, 1 family.</p>
            </div>
          </section>
        </div>

        {formError && <p className="text-sm text-[var(--accent-red)] mt-3">{formError}</p>}

        <div className="pt-4">
          <button
            onClick={handleSave}
            className="w-full xl:w-auto xl:min-w-56 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] text-white font-medium py-2.5 px-6 rounded text-sm cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save & Continue →
          </button>
        </div>
      </div>
    </div>
  )
}
