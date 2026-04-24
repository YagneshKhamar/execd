import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Sparkles, Target, Trash2 } from 'lucide-react'
import { useToast } from '../components/Toast'
import i18n from '../i18n/index'

type GoalType = 'business' | 'personal' | 'family'
type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid'
type GoalsView = 'empty' | 'add' | 'review'

interface GoalInput {
  id: string
  title: string
  type: GoalType
  label: string
  placeholder: string
  validationState: ValidationState
  validationNote: string
}

interface SubgoalItem {
  id?: string
  title: string
  priority: 'high' | 'medium' | 'low'
}

interface GoalWithSubgoals extends GoalInput {
  subgoals: SubgoalItem[]
  loadingSubgoals: boolean
  lastValidatedTitle: string
  suggestedFix?: string
  aiSuggestionUsed?: boolean
}

interface SavedGoal {
  id: string
  title: string
  type: 'business' | 'personal' | 'family'
  ai_validated: number
  ai_validation_note: string
  month: string
}

const TYPE_BADGE: Record<GoalType, string> = {
  business:
    'font-mono text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20',
  personal:
    'font-mono text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20',
  family:
    'font-mono text-[10px] px-2 py-0.5 rounded bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20',
}

const PRIORITY_COLORS = {
  high: 'font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/20',
  medium:
    'font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)] border border-[var(--accent-yellow)]/20',
  low: 'font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--border-default)]/30 text-[var(--text-secondary)] border border-[var(--border-default)]',
}

function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function getMonthLabel(month: string, language: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(language === 'gu' ? 'gu-IN' : 'en-US', {
    month: 'long',
    year: 'numeric',
  })
}

function buildGoalSlots(counts: {
  business: number
  personal: number
  family: number
}): GoalWithSubgoals[] {
  const placeholders: Record<GoalType, string[]> = {
    business: [
      'e.g. Launch landing page and get 50 signups',
      'e.g. Close 3 new paying customers',
      'e.g. Ship v1 of the mobile app',
    ],
    personal: ['e.g. Read 2 books on systems thinking', 'e.g. Exercise 4 times per week'],
    family: [
      'e.g. Plan and take a weekend trip with family',
      'e.g. Set weekly family dinner routine',
    ],
  }

  const createForType = (type: GoalType, count: number): GoalInput[] =>
    Array.from({ length: count }).map((_, index) => ({
      id: `${type}-${index}`,
      title: '',
      type,
      label: `${type.charAt(0).toUpperCase()}${type.slice(1)} Goal ${index + 1}`,
      placeholder: placeholders[type][index] ?? `e.g. ${type} goal ${index + 1}`,
      validationState: 'idle',
      validationNote: '',
    }))

  return [
    ...createForType('business', counts.business),
    ...createForType('personal', counts.personal),
    ...createForType('family', counts.family),
  ].map((goal) => ({ ...goal, subgoals: [], loadingSubgoals: false, lastValidatedTitle: '' }))
}

export default function Goals(): React.JSX.Element {
  const { t } = useTranslation()
  const [view, setView] = useState<GoalsView>('empty')
  const [step, setStep] = useState<'input' | 'subgoals'>('input')
  const [goals, setGoals] = useState<GoalWithSubgoals[]>([])
  const [savedGoals, setSavedGoals] = useState<SavedGoal[]>([])
  const [subgoalMap, setSubgoalMap] = useState<Record<string, SubgoalItem[]>>({})
  const [goalConfig, setGoalConfig] = useState({ business: 3, personal: 1, family: 1 })
  const [validating, setValidating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const month = useMemo(() => getCurrentMonth(), [])
  const { error, success, info } = useToast()
  const goalTypeLabel = (type: GoalType): string => {
    if (type === 'business') return t('goals.businessLabel')
    if (type === 'personal') return t('goals.personalLabel')
    return t('goals.familyLabel')
  }

  async function loadSavedGoals(targetMonth: string): Promise<SavedGoal[]> {
    const fetched = (await window.api.goals.get(targetMonth)) as SavedGoal[]
    setSavedGoals(fetched)

    if (fetched.length > 0) {
      const entries = await Promise.all(
        fetched.map(async (goal) => {
          const subs = (await window.api.subgoals.getByGoal(goal.id)) as SubgoalItem[]
          return [goal.id, subs] as const
        }),
      )
      setSubgoalMap(Object.fromEntries(entries))
    } else {
      setSubgoalMap({})
    }

    return fetched
  }

  useEffect(() => {
    async function bootstrap(): Promise<void> {
      try {
        setLoading(true)
        const config = (await window.api.config.get()) as Record<string, unknown> | null
        const counts = {
          business: Math.max(3, Number(config?.business_goal_count ?? 3)),
          personal: Math.max(1, Number(config?.personal_goal_count ?? 1)),
          family: Math.max(1, Number(config?.family_goal_count ?? 1)),
        }
        setGoalConfig(counts)
        setGoals(buildGoalSlots(counts))

        const fetched = await loadSavedGoals(month)
        setView(fetched.length > 0 ? 'review' : 'empty')
      } catch {
        error(t('toast.loadGoalsFailed'))
      } finally {
        setLoading(false)
      }
    }
    bootstrap()
  }, [error, month])

  function startAddFlow(): void {
    setGoals(buildGoalSlots(goalConfig))
    setStep('input')
    setView('add')
  }

  function updateGoalTitle(index: number, title: string): void {
    setGoals((prev) =>
      prev.map((g, i) =>
        i === index
          ? {
              ...g,
              title,
              validationState: g.validationState === 'valid' ? 'idle' : 'idle',
              validationNote: '',
            }
          : g,
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
      info(`All ${goals.length} goals are required.`)
      return
    }
    setValidating(true)

    const updated = [...goals]

    for (let i = 0; i < updated.length; i++) {
      if (
        updated[i].validationState === 'valid' &&
        updated[i].title === updated[i].lastValidatedTitle
      ) {
        continue
      }

      updated[i] = { ...updated[i], validationState: 'validating' }
      setGoals([...updated])

      const result = await window.api.ai.validateGoal(updated[i].title)

      if (updated[i].aiSuggestionUsed) {
        updated[i] = {
          ...updated[i],
          validationState: 'valid',
          validationNote: 'Accepted via AI suggestion.',
          lastValidatedTitle: updated[i].title,
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
          lastValidatedTitle: isValid ? updated[i].title : updated[i].lastValidatedTitle,
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
        error(t('toast.validationFailed'))
        return
      }
      setGoals([...updated])
    }

    const hasInvalid = updated.some((g) => g.validationState === 'invalid')
    setValidating(false)

    if (hasInvalid) {
      info('Fix flagged goals before continuing.')
      return
    }

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
        error(`Failed to generate subgoals for: ${updated[i].title}`)
      }
      setGoals([...updated])
    }

    setStep('subgoals')
  }

  async function handleSaveAndContinue(): Promise<void> {
    setSaving(true)

    try {
      const result = await window.api.goals.save(
        goals.map((g) => ({ title: g.title, type: g.type, month })),
      )

      if (!result.success || !result.ids || result.ids.length !== goals.length) {
        error(t('toast.saveGoalsFailed'))
        setSaving(false)
        return
      }

      for (let i = 0; i < result.ids.length; i++) {
        const goalId = result.ids[i]
        const subgoals = goals[i].subgoals.filter((s) => s.title.trim())
        if (subgoals.length > 0) {
          await window.api.subgoals.save(
            subgoals.map((s) => ({ goal_id: goalId, title: s.title, priority: s.priority })),
          )
        }
      }

      await loadSavedGoals(month)
      setView('review')
      setStep('input')
      success(t('toast.goalsSaved'))
    } catch (e) {
      console.error('Error saving goals:', e)
      error(t('toast.saveGoalsFailed'))
    } finally {
      setSaving(false)
    }
  }

  const totalSubgoals = savedGoals.reduce(
    (sum, goal) => sum + (subgoalMap[goal.id]?.length ?? 0),
    0,
  )
  const toValidate = goals.filter(
    (g) => g.title.trim() && !(g.validationState === 'valid' && g.title === g.lastValidatedTitle),
  ).length

  if (loading) {
    return (
      <div className="h-full w-full bg-[var(--bg-base)] flex items-center justify-center">
        <p className="text-[var(--text-muted)] text-sm font-mono">{t('common.loading')}</p>
      </div>
    )
  }

  if (view === 'empty') {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[var(--bg-base)] px-6">
        <div className="w-full max-w-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-8 text-center shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
          <div className="w-14 h-14 rounded-full border border-[var(--border-default)] bg-[var(--bg-elevated)] mx-auto mb-5 flex items-center justify-center">
            <Target className="w-7 h-7 text-[var(--text-muted)]" />
          </div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-2">
            {t('goals.noGoals')} {getMonthLabel(month, i18n.language)}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mb-7 text-center max-w-md mx-auto leading-relaxed">
            {t('goals.addGoalsSubtitle')}
          </p>
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            <span className="font-mono text-xs px-3 py-1.5 rounded border border-blue-500/30 text-blue-400 bg-blue-500/10">
              {goalConfig.business} {t('goals.business')}
            </span>
            <span className="font-mono text-xs px-3 py-1.5 rounded border border-purple-500/30 text-purple-400 bg-purple-500/10">
              {goalConfig.personal} {t('goals.personal')}
            </span>
            <span className="font-mono text-xs px-3 py-1.5 rounded border border-[var(--accent-green)]/30 text-[var(--accent-green)] bg-[var(--accent-green)]/10">
              {goalConfig.family} {t('goals.family')}
            </span>
          </div>
          <button
            onClick={startAddFlow}
            className="mt-2 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] text-white px-6 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors"
          >
            {t('goals.addGoals')}
          </button>
        </div>
      </div>
    )
  }

  if (view === 'review') {
    return (
      <div className="h-full w-full overflow-y-auto bg-[var(--bg-base)]">
        <div className="max-w-4xl mx-auto px-8 py-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <p className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase">
                {t('goals.title')}
              </p>
              <p className="font-mono text-xs text-[var(--text-muted)] mt-1">
                {getMonthLabel(month, i18n.language)}
              </p>
              <h1 className="text-xl font-semibold text-[var(--text-primary)] mt-1">
                {t('goals.title')}
              </h1>
            </div>
            <p className="text-xs text-[var(--text-muted)] font-mono">
              {savedGoals.length} / {totalSubgoals} {t('goals.subgoalsActive')}
            </p>
          </div>

          <div className="space-y-3">
            {savedGoals.map((goal, goalIndex) => {
              const subgoals = subgoalMap[goal.id] ?? []
              return (
                <div
                  key={goal.id}
                  className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded overflow-hidden"
                >
                  <div className="flex flex-col gap-2 px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">
                        {String(goalIndex + 1).padStart(2, '0')}
                      </span>
                      <span className={TYPE_BADGE[goal.type]}>{goalTypeLabel(goal.type)}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-[var(--text-primary)] flex-1 min-w-0 leading-snug break-words">
                        {goal.title}
                      </p>
                      <span
                        className={`shrink-0 mt-0.5 font-mono text-[10px] px-2 py-0.5 rounded border ${
                          goal.ai_validated === 1
                            ? 'bg-[var(--accent-green)]/10 text-[var(--accent-green)] border-[var(--accent-green)]/20'
                            : 'bg-[var(--text-muted)]/10 text-[var(--text-muted)] border-[var(--text-muted)]/20'
                        }`}
                      >
                        {goal.ai_validated === 1 ? t('goals.validated') : t('goals.unvalidated')}
                      </span>
                    </div>
                  </div>

                  <div className="px-5 pb-4 border-t border-[var(--border-subtle)] pt-3 space-y-2">
                    {subgoals.length > 0 ? (
                      subgoals.map((subgoal, index) => (
                        <div key={`${goal.id}-${index}`} className="flex items-center gap-3">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              subgoal.priority === 'high'
                                ? 'bg-[var(--accent-red)]'
                                : subgoal.priority === 'medium'
                                  ? 'bg-[var(--accent-yellow)]'
                                  : 'bg-[var(--text-muted)]'
                            }`}
                          />
                          <p className="text-sm text-[var(--text-secondary)] flex-1">
                            {subgoal.title}
                          </p>
                          <span className={PRIORITY_COLORS[subgoal.priority]}>
                            {subgoal.priority}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-[var(--text-muted)] py-1">{t('goals.noGoals')}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-xs text-[var(--text-muted)] text-center mt-6">
            Goals are locked for this month. Contact support to reset.
          </p>
        </div>
      </div>
    )
  }

  if (step === 'subgoals') {
    return (
      <div className="h-full w-full overflow-y-auto bg-[var(--bg-base)]">
        <div className="max-w-4xl mx-auto px-8 py-8">
          <p className="font-mono text-xs text-[var(--text-muted)] mb-1">
            STEP 2 OF 2 - REVIEW SUBGOALS
          </p>
          <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-6">Review Subgoals</h1>

          <div className="space-y-5 mb-6">
            {goals.map((goal, gi) => (
              <div
                key={goal.id}
                className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`${TYPE_BADGE[goal.type]} shrink-0`}>{goalTypeLabel(goal.type)}</span>
                    <span className="text-sm text-[var(--text-primary)] font-medium truncate">
                      {goal.title}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">
                    {goal.subgoals.length} subgoals
                  </span>
                </div>

                {goal.loadingSubgoals ? (
                  <div className="text-[var(--text-muted)] text-xs py-2">
                    {t('goals.generating')}
                  </div>
                ) : (
                  <div>
                    {goal.subgoals.map((sub, si) => (
                      <div
                        key={si}
                        className="flex items-center gap-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-4 py-2.5 mb-1.5"
                      >
                        <select
                          value={sub.priority}
                          onChange={(e) => updateSubgoal(gi, si, 'priority', e.target.value)}
                          className={`${PRIORITY_COLORS[sub.priority]} outline-none cursor-pointer`}
                        >
                          <option value="high">high</option>
                          <option value="medium">medium</option>
                          <option value="low">low</option>
                        </select>
                        <input
                          type="text"
                          value={sub.title}
                          onChange={(e) => updateSubgoal(gi, si, 'title', e.target.value)}
                          className="flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none"
                        />
                        <button
                          onClick={() => removeSubgoal(gi, si)}
                          className="text-[var(--text-muted)] hover:text-[var(--accent-red)] cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addSubgoal(gi)}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer mt-1 ml-1"
                    >
                      {t('goals.addSubgoal')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleSaveAndContinue}
            disabled={saving}
            className="w-full bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded text-sm cursor-pointer transition-colors mt-6"
          >
            {saving ? t('goals.saving') : t('goals.saveGoals')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--bg-base)]">
      <div className="max-w-4xl mx-auto px-8 py-8">
        <button
          onClick={() => setView('empty')}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer mb-6 flex items-center gap-1"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back
        </button>
        <p className="font-mono text-xs text-[var(--text-muted)] mb-1">
          STEP 1 OF 2 - DEFINE GOALS
        </p>
        <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-6">
          {t('goals.addGoals')}
        </h1>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-6">
          {goals.map((slot, index) => (
            <div
              key={slot.id}
              className={`bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 transition-colors ${
                goals[index].validationState === 'invalid'
                  ? 'border-l-2 border-l-[var(--accent-red)]'
                  : goals[index].validationState === 'valid'
                    ? 'border-l-2 border-l-[var(--accent-green)]'
                    : goals[index].validationState === 'validating'
                      ? 'border-l-2 border-l-[var(--accent-blue)]'
                      : ''
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className={TYPE_BADGE[slot.type]}>{goalTypeLabel(slot.type)}</span>
                <span className="font-mono text-xs text-[var(--text-muted)]">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>
              <input
                type="text"
                value={goals[index].title}
                onChange={(e) => updateGoalTitle(index, e.target.value)}
                placeholder={t('goals.goalPlaceholder')}
                className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--border-active)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none mt-3"
              />
              {goals[index].validationState === 'idle' && (
                <p className="text-xs text-[var(--text-secondary)] mt-2">{slot.label}</p>
              )}
              {goals[index].validationNote && (
                <div className="mt-2">
                  <p
                    className={`text-xs ${
                      goals[index].validationState === 'invalid'
                        ? 'text-[var(--accent-red)] mt-2'
                        : goals[index].validationState === 'valid'
                          ? 'text-[var(--accent-green)] mt-2'
                          : 'text-[var(--text-secondary)] mt-2'
                    }`}
                  >
                    {goals[index].validationState === 'valid'
                      ? `✓ ${goals[index].validationNote}`
                      : goals[index].validationNote}
                  </p>
                  {goals[index].validationState === 'invalid' && goals[index].suggestedFix && (
                    <div className="mt-2">
                      <p className="inline-flex items-center gap-1 text-xs text-[var(--accent-yellow)]">
                        <Sparkles className="w-3 h-3" /> AI suggestion
                      </p>
                      <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded p-3 mt-2 text-xs text-[var(--text-secondary)]">
                        <p className="mb-2">{goals[index].suggestedFix}</p>
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
                          className="text-[var(--accent-blue)] hover:text-blue-300 cursor-pointer"
                        >
                          Use this {'->'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={handleValidateAndContinue}
          disabled={validating || toValidate === 0}
          className="w-full bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded text-sm cursor-pointer transition-colors mt-4"
        >
          {validating
            ? t('goals.validating')
            : toValidate === 0
              ? t('goals.validated')
              : `${t('goals.validate')} (${toValidate})`}
        </button>
      </div>
    </div>
  )
}
