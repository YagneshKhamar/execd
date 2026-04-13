import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

type GoalType = 'business' | 'personal' | 'family'
type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid'

interface GoalInput {
  title: string
  type: GoalType
  validationState: ValidationState
  validationNote: string
}

interface SubgoalItem {
  title: string
  priority: 'high' | 'medium' | 'low'
}

interface GoalWithSubgoals extends GoalInput {
  id: string
  subgoals: SubgoalItem[]
  loadingSubgoals: boolean
  suggestedFix?: string
  aiSuggestionUsed?: boolean
}

const GOAL_SLOTS: { type: GoalType; label: string; placeholder: string }[] = [
  {
    type: 'business',
    label: 'Business Goal 1',
    placeholder: 'e.g. Launch landing page and get 50 signups',
  },
  { type: 'business', label: 'Business Goal 2', placeholder: 'e.g. Close 3 new paying customers' },
  { type: 'business', label: 'Business Goal 3', placeholder: 'e.g. Ship v1 of the mobile app' },
  {
    type: 'personal',
    label: 'Personal Goal',
    placeholder: 'e.g. Read 2 books on systems thinking',
  },
  {
    type: 'family',
    label: 'Family Goal',
    placeholder: 'e.g. Plan and take a weekend trip with family',
  },
]

const TYPE_BADGE: Record<GoalType, string> = {
  business: 'bg-blue-950 border-blue-800 text-blue-400',
  personal: 'bg-purple-950 border-purple-800 text-purple-400',
  family: 'bg-green-950 border-green-800 text-green-400',
}

const PRIORITY_COLORS = {
  high: 'text-red-400 bg-red-950 border-red-800',
  medium: 'text-yellow-400 bg-yellow-950 border-yellow-800',
  low: 'text-gray-400 bg-gray-800 border-gray-700',
}

function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function Goals(): React.JSX.Element {
  const navigate = useNavigate()

  const [goals, setGoals] = useState<GoalWithSubgoals[]>(
    GOAL_SLOTS.map((slot, i) => ({
      id: String(i),
      title: '',
      type: slot.type,
      validationState: 'idle',
      validationNote: '',
      subgoals: [],
      loadingSubgoals: false,
    })),
  )

  const [step, setStep] = useState<'input' | 'subgoals'>('input')
  const [error, setError] = useState('')
  const [validating, setValidating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [goalsAlreadySet, setGoalsAlreadySet] = useState(false)

  useEffect(() => {
    async function checkExistingGoals(): Promise<void> {
      const month = getCurrentMonth()
      const existing = (await window.api.goals.get(month)) as unknown[]
      if (existing && existing.length > 0) {
        setGoalsAlreadySet(true)
      }
    }
    checkExistingGoals()
  }, [])

  function updateGoalTitle(index: number, title: string): void {
    setGoals((prev) =>
      prev.map((g, i) =>
        i === index ? { ...g, title, validationState: 'idle', validationNote: '' } : g,
      ),
    )
  }

  function updateSubgoal(
    goalIndex: number,
    subIndex: number,
    field: keyof SubgoalItem,
    value: string,
  ): void {
    setGoals((prev) =>
      prev.map((g, i) =>
        i === goalIndex
          ? {
              ...g,
              subgoals: g.subgoals.map((s, j) => (j === subIndex ? { ...s, [field]: value } : s)),
            }
          : g,
      ),
    )
  }

  function removeSubgoal(goalIndex: number, subIndex: number): void {
    setGoals((prev) =>
      prev.map((g, i) =>
        i === goalIndex ? { ...g, subgoals: g.subgoals.filter((_, j) => j !== subIndex) } : g,
      ),
    )
  }

  function addSubgoal(goalIndex: number): void {
    setGoals((prev) =>
      prev.map((g, i) =>
        i === goalIndex
          ? { ...g, subgoals: [...g.subgoals, { title: '', priority: 'medium' }] }
          : g,
      ),
    )
  }

  async function handleValidateAndContinue(): Promise<void> {
    const empty = goals.filter((g) => !g.title.trim())
    if (empty.length > 0) {
      setError('All 5 goals are required.')
      return
    }
    setError('')
    setValidating(true)

    const updated = [...goals]

    for (let i = 0; i < updated.length; i++) {
      updated[i] = { ...updated[i], validationState: 'validating' }
      setGoals([...updated])

      const result = await window.api.ai.validateGoal(updated[i].title)

      console.log('subgoals result:', JSON.stringify(result))

      if (updated[i].aiSuggestionUsed) {
        updated[i] = {
          ...updated[i],
          validationState: 'valid',
          validationNote: 'Accepted via AI suggestion.',
          suggestedFix: undefined,
        }
        setGoals([...updated])
        continue
      }

      if (result.success && result.data) {
        const isValid = result.data.valid
        let suggestedFix: string | undefined

        if (!isValid) {
          const fixResult = await window.api.ai.suggestGoalFix(updated[i].title, result.data.note)
          if (fixResult.success && fixResult.data) {
            suggestedFix = fixResult.data
          }
        }

        updated[i] = {
          ...updated[i],
          validationState: isValid ? 'valid' : 'invalid',
          validationNote: result.data.note,
          suggestedFix,
        }
      } else {
        updated[i] = {
          ...updated[i],
          validationState: 'invalid',
          validationNote: 'AI validation failed. Check your API key in Setup.',
        }
        setGoals([...updated])
        setValidating(false)
        setError('AI validation failed. Check your API key in Setup.')
        return
      }
      setGoals([...updated])
    }

    const hasInvalid = updated.some((g) => g.validationState === 'invalid')
    setValidating(false)

    if (hasInvalid) {
      setError('Some goals need revision. Fix the flagged goals and try again.')
      return
    }

    // All valid — generate subgoals
    for (let i = 0; i < updated.length; i++) {
      updated[i] = { ...updated[i], loadingSubgoals: true }
      setGoals([...updated])

      const result = await window.api.ai.generateSubgoals(updated[i].title, updated[i].type)

      if (result.success && result.data) {
        updated[i] = {
          ...updated[i],
          subgoals: result.data as SubgoalItem[],
          loadingSubgoals: false,
        }
      } else {
        updated[i] = { ...updated[i], loadingSubgoals: false }
      }
      setGoals([...updated])
    }

    setStep('subgoals')
  }

  async function handleSaveAndContinue(): Promise<void> {
    const month = getCurrentMonth()
    setSaving(true)

    try {
      const result = await window.api.goals.save(
        goals.map((g) => ({ title: g.title, type: g.type, month })),
      )

      if (!result.success) {
        setError('Failed to save goals.')
        setSaving(false)
        return
      }

      const savedGoals = (await window.api.goals.get(month)) as { id: string }[]

      for (let i = 0; i < savedGoals.length; i++) {
        const goalId = savedGoals[i].id
        const subgoals = goals[i].subgoals.filter((s) => s.title.trim())
        if (subgoals.length > 0) {
          await window.api.subgoals.save(
            subgoals.map((s) => ({ goal_id: goalId, title: s.title, priority: s.priority })),
          )
        }
      }

      navigate('/today')
    } catch (e) {
      console.error('Error saving goals:', e)
      setError('Something went wrong saving goals.')
    } finally {
      setSaving(false)
    }
  }

  if (step === 'subgoals') {
    return (
      <div className="h-screen w-screen bg-gray-950 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-10">
          <div className="mb-8">
            <button
              onClick={() => setStep('input')}
              className="text-gray-600 hover:text-gray-400 text-sm transition-colors cursor-pointer mb-2 block"
            >
              ← Back to Goals
            </button>
            <h1 className="text-2xl font-bold text-white tracking-tight">Review Subgoals</h1>
            <p className="text-gray-500 text-sm mt-1">
              AI has broken each goal into subgoals. Edit, remove, or add before confirming.
            </p>
          </div>

          <div className="space-y-6 mb-6">
            {goals.map((goal, gi) => (
              <div key={gi} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white text-sm font-semibold truncate flex-1 mr-2">
                    {goal.title}
                  </span>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TYPE_BADGE[goal.type]}`}
                  >
                    {goal.type}
                  </span>
                </div>

                {goal.loadingSubgoals ? (
                  <div className="text-gray-600 text-xs py-2">Generating subgoals...</div>
                ) : (
                  <div className="space-y-2">
                    {goal.subgoals.map((sub, si) => (
                      <div key={si} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={sub.title}
                          onChange={(e) => updateSubgoal(gi, si, 'title', e.target.value)}
                          className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-xs placeholder-gray-700 focus:outline-none focus:border-blue-500"
                        />
                        <select
                          value={sub.priority}
                          onChange={(e) => updateSubgoal(gi, si, 'priority', e.target.value)}
                          className={`text-xs border rounded-lg px-2 py-2 focus:outline-none cursor-pointer ${PRIORITY_COLORS[sub.priority]}`}
                        >
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                        </select>
                        <button
                          onClick={() => removeSubgoal(gi, si)}
                          className="text-gray-700 hover:text-red-400 text-xs transition-colors cursor-pointer px-1"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addSubgoal(gi)}
                      className="text-gray-600 hover:text-gray-400 text-xs transition-colors cursor-pointer mt-1"
                    >
                      + Add subgoal
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {error && (
            <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-2.5 mb-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            onClick={handleSaveAndContinue}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-semibold py-3 rounded-lg transition-colors text-sm cursor-pointer"
          >
            {saving ? 'Saving...' : 'Confirm & Start Month →'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-gray-950 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <button
            onClick={() => navigate('/setup')}
            className="text-gray-600 hover:text-gray-400 text-sm transition-colors cursor-pointer mb-2 block"
          >
            ← Setup
          </button>
          <h1 className="text-2xl font-bold text-white tracking-tight">Monthly Goals</h1>
          <p className="text-gray-500 text-sm mt-1">
            Define exactly 5 goals. Be specific — vague goals produce vague tasks.
          </p>
        </div>

        {goalsAlreadySet && (
          <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-4 mb-6">
            <p className="text-yellow-400 text-sm font-semibold mb-1">
              Goals already set for this month.
            </p>
            <p className="text-yellow-600 text-xs">
              You cannot redefine goals mid-month. Come back next month to set new goals.
            </p>
            <button
              onClick={() => navigate('/today')}
              className="mt-3 text-yellow-400 hover:text-yellow-300 text-xs cursor-pointer transition-colors"
            >
              ← Back to Today
            </button>
          </div>
        )}

        <div className="space-y-4 mb-6">
          {GOAL_SLOTS.map((slot, index) => (
            <div
              key={index}
              className={`bg-gray-900 border rounded-xl p-4 transition-colors ${
                goals[index].validationState === 'invalid'
                  ? 'border-red-800'
                  : goals[index].validationState === 'valid'
                    ? 'border-green-800'
                    : 'border-gray-800'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-white text-sm font-semibold">{slot.label}</span>
                <div className="flex items-center gap-2">
                  {goals[index].validationState === 'validating' && (
                    <span className="text-yellow-500 text-xs">Checking...</span>
                  )}
                  {goals[index].validationState === 'valid' && (
                    <span className="text-green-500 text-xs">✓ Valid</span>
                  )}
                  {goals[index].validationState === 'invalid' && (
                    <span className="text-red-400 text-xs">✕ Needs revision</span>
                  )}
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TYPE_BADGE[slot.type]}`}
                  >
                    {slot.type}
                  </span>
                </div>
              </div>
              <input
                type="text"
                value={goals[index].title}
                onChange={(e) => updateGoalTitle(index, e.target.value)}
                placeholder={slot.placeholder}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-700 focus:outline-none focus:border-blue-500 transition-colors"
              />
              {goals[index].validationNote && (
                <div className="mt-2">
                  <p
                    className={`text-xs ${
                      goals[index].validationState === 'invalid' ? 'text-red-400' : 'text-green-500'
                    }`}
                  >
                    {goals[index].validationNote}
                  </p>
                  {goals[index].validationState === 'invalid' && goals[index].suggestedFix && (
                    <div className="mt-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
                      <p className="text-gray-400 text-xs mb-1.5">AI suggestion:</p>
                      <p className="text-white text-xs mb-2">{goals[index].suggestedFix}</p>
                      <button
                        onClick={() => {
                          const clean = goals[index]
                            .suggestedFix!.replace(/^["']|["']$/g, '')
                            .trim()
                          updateGoalTitle(index, clean)
                          setGoals((prev) =>
                            prev.map((g, i) =>
                              i === index ? { ...g, aiSuggestionUsed: true } : g,
                            ),
                          )
                        }}
                        className="text-blue-400 hover:text-blue-300 text-xs cursor-pointer transition-colors"
                      >
                        Use this suggestion →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-2.5 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <button
          onClick={handleValidateAndContinue}
          disabled={validating || goalsAlreadySet}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-semibold py-3 rounded-lg transition-colors text-sm cursor-pointer"
        >
          {validating ? 'Validating with AI...' : 'Validate & Generate Subgoals →'}
        </button>
      </div>
    </div>
  )
}
