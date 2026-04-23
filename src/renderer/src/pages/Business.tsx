import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'

const ACTIVITIES = [
  { id: 'customer_visits', label: 'Customer Visits' },
  { id: 'phone_followups', label: 'Phone Follow-ups' },
  { id: 'whatsapp', label: 'WhatsApp Messages' },
  { id: 'new_party_visits', label: 'New Party Visits' },
  { id: 'collection_calls', label: 'Collection Calls' },
  { id: 'exhibitions', label: 'Exhibitions' },
]

const BUSINESS_TYPES = [
  { value: 'textile', label: 'Textile' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'trading', label: 'Trading' },
  { value: 'retail', label: 'Retail' },
  { value: 'services', label: 'Services' },
  { value: 'other', label: 'Other' },
]

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिंदी' },
  { value: 'gu', label: 'ગુજરાતી' },
]
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type BusinessProps = {
  isSetup?: boolean
}

export default function Business({ isSetup = false }: BusinessProps): React.JSX.Element {
  const navigate = useNavigate()
  const { error, success } = useToast()

  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [otherBusinessType, setOtherBusinessType] = useState('')
  const [monthlySalesTarget, setMonthlySalesTarget] = useState('')
  const [collectionTarget, setCollectionTarget] = useState('')
  const [primaryActivities, setPrimaryActivities] = useState<string[]>([])
  const [teamSize, setTeamSize] = useState('1')
  const [language, setLanguage] = useState('en')
  const [fiscalYearStart, setFiscalYearStart] = useState(4)
  const [monthlyTargets, setMonthlyTargets] = useState<
    { year_month: string; sales_target: number; collection_target: number }[]
  >([])
  const [generatingTargets, setGeneratingTargets] = useState(false)
  const [targetsGenerated, setTargetsGenerated] = useState(false)
  const [savingTargets, setSavingTargets] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const currentYear = new Date().getFullYear()

  useEffect(() => {
    async function hydrateBusiness(): Promise<void> {
      try {
        const data = await window.api.business.get()
        if (data) {
          setBusinessName(data.business_name ?? '')
          const loadedBusinessType = data.business_type ?? 'other'
          if (loadedBusinessType.startsWith('other:')) {
            setBusinessType('other')
            setOtherBusinessType(loadedBusinessType.slice('other:'.length))
          } else {
            setBusinessType(loadedBusinessType)
            setOtherBusinessType('')
          }
          setMonthlySalesTarget(
            data.monthly_sales_target === null || data.monthly_sales_target === undefined
              ? ''
              : String(data.monthly_sales_target),
          )
          setCollectionTarget(
            data.collection_target === null || data.collection_target === undefined
              ? ''
              : String(data.collection_target),
          )
          setPrimaryActivities(
            Array.isArray(data.primary_activities) ? data.primary_activities : [],
          )
          setTeamSize(String(data.team_size ?? 1))
          setLanguage(data.language ?? 'en')
        }

        const config = (await window.api.config.get()) as { fiscal_year_start?: number } | null
        const loadedFiscalYearStart = Number(config?.fiscal_year_start ?? 4)
        setFiscalYearStart(loadedFiscalYearStart)

        const existingTargets = await window.api.sales.getMonthlyTargets({
          fiscalYearStart: loadedFiscalYearStart,
          year: currentYear,
        })
        const hasExistingTargets = existingTargets.some(
          (item) => Number(item.sales_target) > 0 || Number(item.collection_target) > 0,
        )
        if (hasExistingTargets) {
          setMonthlyTargets(existingTargets)
          setTargetsGenerated(true)
        }
      } catch {
        error('Failed to load business profile.')
      } finally {
        setLoaded(true)
      }
    }

    hydrateBusiness()
  }, [currentYear, error])

  function toggleActivity(activityId: string): void {
    setPrimaryActivities((prev) =>
      prev.includes(activityId) ? prev.filter((id) => id !== activityId) : [...prev, activityId],
    )
  }

  async function generateTargets(): Promise<void> {
    if (!monthlySalesTarget) {
      error('Yearly sales target is required.')
      return
    }

    setGeneratingTargets(true)
    try {
      const result = await window.api.ai.generateMonthlyTargets({
        yearlyTarget: Number(monthlySalesTarget),
        collectionTarget: collectionTarget ? Number(collectionTarget) : null,
        businessType,
        fiscalYearStart,
        year: currentYear,
      })

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to generate monthly targets.')
      }

      const parsedTargets = result.data.map((item) => ({
        year_month: item.month,
        sales_target: Number(item.sales_target ?? 0),
        collection_target: Number(item.collection_target ?? 0),
      }))
      setMonthlyTargets(parsedTargets)
      setTargetsGenerated(true)
    } catch {
      error('Failed to generate monthly targets.')
    } finally {
      setGeneratingTargets(false)
    }
  }

  async function saveTargets(): Promise<void> {
    setSavingTargets(true)
    try {
      await window.api.sales.saveMonthlyTargets(monthlyTargets)
      success('Monthly targets saved.')
    } catch {
      error('Failed to save monthly targets.')
    } finally {
      setSavingTargets(false)
    }
  }

  async function handleSave(): Promise<void> {
    const trimmedName = businessName.trim()
    if (!trimmedName) {
      error('Business name is required.')
      return
    }

    setSaving(true)
    try {
      const savedBusinessType =
        businessType === 'other' && otherBusinessType.trim()
          ? `other:${otherBusinessType.trim()}`
          : businessType

      await window.api.business.save({
        business_name: trimmedName,
        business_type: savedBusinessType,
        monthly_sales_target: monthlySalesTarget ? Number(monthlySalesTarget) : null,
        collection_target: collectionTarget ? Number(collectionTarget) : null,
        primary_activities: primaryActivities,
        team_size: Number(teamSize) || 1,
        language,
      })

      if (isSetup) {
        navigate('/today')
      } else {
        success('Business profile saved.')
      }
    } catch {
      error('Failed to save business profile.')
    } finally {
      setSaving(false)
    }
  }

  const sectionLabelClass =
    'block text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest mb-3'
  const inputClass =
    'w-full bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--border-active)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none'
  const cardClass = 'bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg p-4'
  const monthlySalesTotal = monthlyTargets.reduce((sum, item) => sum + Number(item.sales_target || 0), 0)
  const yearlySalesTarget = Number(monthlySalesTarget || 0)
  const targetDiffRatio =
    yearlySalesTarget > 0 ? Math.abs(monthlySalesTotal - yearlySalesTarget) / yearlySalesTarget : 0
  const totalColorClass =
    monthlySalesTotal === yearlySalesTarget
      ? 'text-[var(--accent-green)]'
      : targetDiffRatio < 0.05
        ? 'text-[var(--accent-yellow)]'
        : 'text-[var(--accent-red)]'

  const formContent = (
    <div className={isSetup ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
      <section className={cardClass}>
        <label className={sectionLabelClass}>Business</label>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-1">Business Name</p>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Mehta Textiles"
              className={inputClass}
            />
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-1">Business Type</p>
            <select
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              className={`${inputClass} cursor-pointer`}
            >
              <option value="">Select a business type</option>
              {BUSINESS_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            {businessType === 'other' && (
              <input
                type="text"
                value={otherBusinessType}
                onChange={(e) => setOtherBusinessType(e.target.value)}
                placeholder="Describe your business type..."
                className="mt-2 w-full bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--border-active)] rounded px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
              />
            )}
          </div>
        </div>
      </section>

      <section className={cardClass}>
        <label className={sectionLabelClass}>Preferences</label>
        <div>
          <p className="text-xs text-[var(--text-secondary)] mb-1">App Language</p>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className={`${inputClass} cursor-pointer`}
          >
            {LANGUAGES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className={`${cardClass} ${isSetup ? '' : 'md:col-span-2'}`}>
        <label className={sectionLabelClass}>Operations</label>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-2">Primary Activities</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ACTIVITIES.map((activity) => (
                <label
                  key={activity.id}
                  className="flex items-center gap-2 text-sm text-[var(--text-primary)]"
                >
                  <input
                    type="checkbox"
                    checked={primaryActivities.includes(activity.id)}
                    onChange={() => toggleActivity(activity.id)}
                    className="accent-[var(--accent-blue)]"
                  />
                  <span>{activity.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-1">Team Size</p>
            <input
              type="number"
              min={1}
              max={500}
              value={teamSize}
              onChange={(e) => setTeamSize(e.target.value)}
              placeholder="Including yourself"
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className={`${cardClass} ${isSetup ? '' : 'md:col-span-2'}`}>
        <label className={sectionLabelClass}>Targets</label>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-[var(--text-secondary)] mb-1">Yearly Sales Target (optional)</p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--text-muted)] font-mono">₹</span>
                <input
                  type="number"
                  value={monthlySalesTarget}
                  onChange={(e) => setMonthlySalesTarget(e.target.value)}
                  placeholder="0"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <p className="text-xs text-[var(--text-secondary)] mb-1">
                Yearly Collection Target (optional)
              </p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--text-muted)] font-mono">₹</span>
                <input
                  type="number"
                  value={collectionTarget}
                  onChange={(e) => setCollectionTarget(e.target.value)}
                  placeholder="0"
                  className={inputClass}
                />
              </div>
            </div>
          </div>
          {monthlySalesTarget && (
            <button
              type="button"
              onClick={generateTargets}
              disabled={generatingTargets}
              className="w-full bg-transparent border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)] hover:text-[var(--text-primary)] text-sm py-2.5 px-4 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {generatingTargets ? 'Generating...' : 'Generate Monthly Plan with AI'}
            </button>
          )}

          {targetsGenerated && monthlyTargets.length > 0 && (
            <div className="mt-2 border border-[var(--border-subtle)] rounded-lg px-3 py-2">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                <p className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-widest">
                  Monthly Breakdown
                </p>
                <p className={`text-sm font-mono ${totalColorClass}`}>Total: ₹{monthlySalesTotal}</p>
              </div>

              <div>
                {monthlyTargets.map((item, index) => {
                  const monthPart = Number(item.year_month.split('-')[1] ?? 1)
                  const monthLabel = MONTH_NAMES[Math.max(0, Math.min(11, monthPart - 1))]
                  return (
                    <div
                      key={item.year_month}
                      className="flex items-center gap-3 py-2 border-b border-[var(--border-subtle)]"
                    >
                      <div className="w-32 shrink-0">
                        <p className="text-sm text-[var(--text-primary)]">{monthLabel}</p>
                        <p className="text-xs font-mono text-[var(--text-muted)]">{item.year_month}</p>
                      </div>
                      <input
                        type="number"
                        value={item.sales_target}
                        onChange={(e) => {
                          const value = Number(e.target.value || 0)
                          setMonthlyTargets((prev) =>
                            prev.map((target, targetIndex) =>
                              targetIndex === index ? { ...target, sales_target: value } : target,
                            ),
                          )
                        }}
                        className={inputClass}
                      />
                      <input
                        type="number"
                        value={item.collection_target}
                        onChange={(e) => {
                          const value = Number(e.target.value || 0)
                          setMonthlyTargets((prev) =>
                            prev.map((target, targetIndex) =>
                              targetIndex === index ? { ...target, collection_target: value } : target,
                            ),
                          )
                        }}
                        className={inputClass}
                      />
                    </div>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={saveTargets}
                disabled={savingTargets}
                className="w-full mt-3 bg-[var(--accent-blue)] text-white font-medium py-2.5 px-6 rounded text-sm cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {savingTargets ? 'Saving...' : 'Save Monthly Targets'}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )

  if (isSetup) {
    return (
      <div className="absolute inset-0 overflow-y-auto bg-[var(--bg-base)]">
        <div className="min-h-full flex items-start justify-center py-8 px-4">
          <div className="w-full max-w-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-8">
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-[var(--text-primary)]">Business Profile</h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Tell us about your business
              </p>
            </div>

            {!loaded ? (
              <div className="py-8 text-center text-xs font-mono text-[var(--text-muted)]">
                loading...
              </div>
            ) : (
              <>
                {formContent}
                <div className="pt-6">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full bg-[var(--accent-blue)] hover:bg-[var(--accent-blue)] text-white font-medium py-2.5 px-6 rounded text-sm cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : 'Continue →'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--bg-base)]">
      <div className="max-w-4xl mx-auto px-8 py-8">
        <div className="mb-5">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Business Profile</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Edit your business details</p>
        </div>

        {!loaded ? (
          <div className="py-8 text-center text-xs font-mono text-[var(--text-muted)]">
            loading...
          </div>
        ) : (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5">
            {formContent}
            <div className="pt-5 flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-[var(--accent-blue)] hover:bg-[var(--accent-blue)] text-white font-medium py-2.5 px-6 rounded text-sm cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
