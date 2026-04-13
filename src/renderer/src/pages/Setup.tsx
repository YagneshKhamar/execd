import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

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

export default function Setup(): JSX.Element {
  const navigate = useNavigate()

  const [provider, setProvider] = useState<'openai' | 'anthropic'>('openai')
  const [apiKey, setApiKey] = useState('')
  const [workingStart, setWorkingStart] = useState('09:00')
  const [workingEnd, setWorkingEnd] = useState('18:00')
  const [breakStart, setBreakStart] = useState('13:00')
  const [breakEnd, setBreakEnd] = useState('14:00')
  const [workingDays, setWorkingDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri'])
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState('')

  function toggleDay(day: string): void {
    setWorkingDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
  }

  function validate(): boolean {
    if (!apiKey.trim()) {
      setError('API key is required.')
      return false
    }
    if (workingDays.length === 0) {
      setError('Select at least one working day.')
      return false
    }
    if (workingStart >= workingEnd) {
      setError('Working end time must be after start time.')
      return false
    }
    setError('')
    return true
  }

  async function handleSave(): Promise<void> {
    if (!validate()) return
    await window.api.config.save({
      ai_provider: provider,
      api_key: apiKey,
      working_start: workingStart,
      working_end: workingEnd,
      working_days: workingDays,
      break_start: breakStart,
      break_end: breakEnd,
    })
    navigate('/goals')
  }
  return (
    <div className="h-screen w-screen bg-gray-950 overflow-y-auto flex items-start justify-center">
      <div className="w-full max-w-md px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white tracking-tight">ExecOS Setup</h1>
          <p className="text-gray-500 text-sm mt-1">Configure once. Run every day.</p>
        </div>

        <div className="space-y-5">
          {/* AI Provider */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              AI Provider
            </label>
            <div className="flex gap-2">
              {(['openai', 'anthropic'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                    provider === p
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {p === 'openai' ? 'OpenAI' : 'Anthropic'}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-700 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs cursor-pointer"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-gray-700 text-xs mt-1.5">
              Stored encrypted on your machine. Never sent anywhere else.
            </p>
          </div>

          {/* Working Hours */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Working Hours
            </label>
            <div className="flex items-center gap-3">
              <input
                type="time"
                value={workingStart}
                onChange={(e) => setWorkingStart(e.target.value)}
                className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
              <span className="text-gray-600 text-sm">to</span>
              <input
                type="time"
                value={workingEnd}
                onChange={(e) => setWorkingEnd(e.target.value)}
                className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          {/* Break Time */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Break Time
            </label>
            <div className="flex items-center gap-3">
              <input
                type="time"
                value={breakStart}
                onChange={(e) => setBreakStart(e.target.value)}
                className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
              <span className="text-gray-600 text-sm">to</span>
              <input
                type="time"
                value={breakEnd}
                onChange={(e) => setBreakEnd(e.target.value)}
                className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          {/* Working Days */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Working Days
            </label>
            <div className="flex gap-1.5">
              {DAYS.map((day) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    workingDays.includes(day)
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-600'
                  }`}
                >
                  {DAY_LABELS[day]}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-2.5">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg transition-colors text-sm cursor-pointer mt-2"
          >
            Save & Continue →
          </button>
        </div>
      </div>
    </div>
  )
}
