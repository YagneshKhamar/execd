import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import SearchableSelect, { type SelectOption } from '../components/SearchableSelect'
import { useToast } from '../components/Toast'
import i18n from '../i18n/index'

type BusinessProps = {
  isSetup?: boolean
}

export default function Business({ isSetup = false }: BusinessProps): React.JSX.Element {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { error, success } = useToast()
  function getMonthName(monthIndex: number, short = false): string {
    const keys = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ]
    const key = short ? `${keys[monthIndex]}Short` : keys[monthIndex]
    return t(`months.${key}`)
  }
  const ACTIVITIES = [
    { id: 'customer_visits', label: t('business.activities.customer_visits') },
    { id: 'phone_followups', label: t('business.activities.phone_followups') },
    { id: 'whatsapp', label: t('business.activities.whatsapp') },
    { id: 'new_party_visits', label: t('business.activities.new_party_visits') },
    { id: 'collection_calls', label: t('business.activities.collection_calls') },
    { id: 'exhibitions', label: t('business.activities.exhibitions') },
  ]
  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [businessDescription, setBusinessDescription] = useState('')
  const [otherBusinessType, setOtherBusinessType] = useState('')
  const [monthlySalesTarget, setMonthlySalesTarget] = useState('')
  const [collectionTarget, setCollectionTarget] = useState('')
  const [salesTargetUnit, setSalesTargetUnit] = useState<'amount' | 'units'>('amount')
  const [salesTargetUnitLabel, setSalesTargetUnitLabel] = useState('')
  const [primaryActivities, setPrimaryActivities] = useState<string[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [newDepartment, setNewDepartment] = useState('')
  const [teamSize, setTeamSize] = useState('1')
  const [language, setLanguage] = useState('en')
  const [fiscalYearStart, setFiscalYearStart] = useState(4)
  const [monthlyTargets, setMonthlyTargets] = useState<
    { year_month: string; sales_target: number; collection_target: number }[]
  >([])
  const [daysRemainingWarning, setDaysRemainingWarning] = useState<number | null>(null)
  const [generatingTargets, setGeneratingTargets] = useState(false)
  const [targetsGenerated, setTargetsGenerated] = useState(false)
  const [savingTargets, setSavingTargets] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const currentYear = new Date().getFullYear()

  useEffect(() => {
    async function hydrateBusiness(): Promise<void> {
      try {
        const profile = await window.api.business.get()
        if (profile) {
          setBusinessName(profile.business_name ?? '')
          const loadedBusinessType = profile.business_type ?? 'other'
          const normalizedBusinessType =
            loadedBusinessType === 'trading' ? 'trading_wholesale' : loadedBusinessType
          if (normalizedBusinessType.startsWith('other:')) {
            setBusinessType('other')
            setOtherBusinessType(normalizedBusinessType.slice('other:'.length))
          } else {
            setBusinessType(normalizedBusinessType)
            setOtherBusinessType('')
          }
          setBusinessDescription(profile.business_description ?? '')
          setMonthlySalesTarget(
            profile.monthly_sales_target === null || profile.monthly_sales_target === undefined
              ? ''
              : String(profile.monthly_sales_target),
          )
          setCollectionTarget(
            profile.collection_target === null || profile.collection_target === undefined
              ? ''
              : String(profile.collection_target),
          )
          setSalesTargetUnit(
            profile.sales_target_unit === 'amount'
              ? 'amount'
              : profile.sales_target_unit === 'units' || profile.sales_target_unit === 'custom'
                ? 'units'
                : 'amount',
          )
          setSalesTargetUnitLabel(String(profile.sales_target_unit_label || ''))
          setPrimaryActivities(
            Array.isArray(profile.primary_activities) ? profile.primary_activities : [],
          )
          setDepartments(profile.departments ?? [])
          setTeamSize(String(profile.team_size ?? 1))
          setLanguage(profile.language ?? 'en')
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
        error(t('toast.businessFailed'))
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
      error(t('toast.targetsSalesRequired'))
      return
    }

    const today = new Date()
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const daysRemaining = lastDay - today.getDate() + 1
    setDaysRemainingWarning(daysRemaining < 15 ? daysRemaining : null)

    setGeneratingTargets(true)
    try {
      const result = await window.api.ai.generateMonthlyTargets({
        yearlyTarget: Number(monthlySalesTarget),
        collectionTarget: collectionTarget ? Number(collectionTarget) : null,
        businessType,
        businessDescription,
        fiscalYearStart,
        year: currentYear,
        currentMonth,
        daysRemainingInCurrentMonth: daysRemaining,
        salesTargetUnit,
        salesTargetUnitLabel,
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
      error(t('toast.generateTargetsFailed'))
    } finally {
      setGeneratingTargets(false)
    }
  }

  async function saveTargets(): Promise<void> {
    setSavingTargets(true)
    try {
      await window.api.sales.saveMonthlyTargets(monthlyTargets)
      success(t('toast.targetsSaved'))
    } catch {
      error(t('toast.generateTargetsFailed'))
    } finally {
      setSavingTargets(false)
    }
  }

  async function handleSave(): Promise<void> {
    const trimmedName = businessName.trim()
    if (!trimmedName) {
      error(t('business.businessName') + ' ' + t('common.noData'))
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
        business_description: businessDescription,
        sales_target_unit: salesTargetUnit,
        sales_target_unit_label: salesTargetUnitLabel,
        monthly_sales_target: monthlySalesTarget ? Number(monthlySalesTarget) : null,
        collection_target: collectionTarget ? Number(collectionTarget) : null,
        primary_activities: primaryActivities,
        departments: departments,
        team_size: Number(teamSize) || 1,
        language,
      })

      if (language !== i18n.language) {
        await i18n.changeLanguage(language)
      }

      if (isSetup) {
        navigate('/today')
      } else {
        success(t('toast.businessSaved'))
      }
    } catch {
      error(t('toast.businessFailed'))
    } finally {
      setSaving(false)
    }
  }

  const sectionLabelClass =
    'block text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest mb-3'
  const inputClass =
    'w-full bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--border-active)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none'
  const cardClass = 'bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg p-4'
  const monthlySalesTotal = monthlyTargets.reduce(
    (sum, item) => sum + Number(item.sales_target || 0),
    0,
  )
  const yearlySalesTarget = Number(monthlySalesTarget || 0)
  const targetDiffRatio =
    yearlySalesTarget > 0 ? Math.abs(monthlySalesTotal - yearlySalesTarget) / yearlySalesTarget : 0
  const totalColorClass =
    monthlySalesTotal === yearlySalesTarget
      ? 'text-[var(--accent-green)]'
      : targetDiffRatio < 0.05
        ? 'text-[var(--accent-yellow)]'
        : 'text-[var(--accent-red)]'
  const activeUnitLabel = salesTargetUnitLabel.trim() || 'units'

  const formContent = (
    <div className={isSetup ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
      <section className={cardClass}>
        <label className={sectionLabelClass}>{t('business.businessSection')}</label>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-1">
              {t('business.businessName')}
            </p>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder={t('business.businessNamePlaceholder')}
              className={inputClass}
            />
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-1">
              {t('business.businessType')}
            </p>
            <SearchableSelect
              value={businessType}
              onChange={(val) => setBusinessType(val)}
              options={[
                { value: '', label: 'Select a business type' },
                { value: 'textile', label: 'Textile' },
                { value: 'manufacturing', label: 'Manufacturing' },
                { value: 'trading_wholesale', label: 'Trading — Wholesaler' },
                { value: 'trading_retail', label: 'Trading — Retailer' },
                { value: 'retail', label: 'Retail' },
                { value: 'services', label: 'Services' },
                { value: 'it', label: 'IT / Software' },
                { value: 'ca', label: 'CA / Accounting' },
                { value: 'other', label: 'Other' },
              ].map((option): SelectOption => option)}
            />
            {businessType === 'other' && (
              <input
                type="text"
                value={otherBusinessType}
                onChange={(e) => setOtherBusinessType(e.target.value)}
                placeholder={t('business.otherPlaceholder')}
                className="mt-2 w-full bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--border-active)] rounded px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
              />
            )}
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Nature of Business
            </label>
            <textarea
              value={businessDescription}
              onChange={(e) => setBusinessDescription(e.target.value)}
              placeholder="Describe what your business does, who your customers are, how you sell — in any language (English, Gujarati, Hindi)"
              rows={4}
              className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-blue)] resize-none transition-colors"
            />
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Used by AI to generate more relevant tasks and insights for your business.
            </p>
          </div>
        </div>
      </section>

      <section className={cardClass}>
        <label className={sectionLabelClass}>{t('business.preferencesSection')}</label>
        <div>
          <p className="text-xs text-[var(--text-secondary)] mb-1">{t('business.appLanguage')}</p>
          <SearchableSelect
            value={language}
            onChange={(val) => setLanguage(val)}
            options={[
              { value: 'en', label: 'English' },
              { value: 'gu', label: 'ગુજરાતી' },
              { value: 'hi', label: 'हिंदी' },
            ].map((option): SelectOption => option)}
          />
        </div>
      </section>

      <section className={`${cardClass} ${isSetup ? '' : 'md:col-span-2'}`}>
        <label className={sectionLabelClass}>{t('business.operationsSection')}</label>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-2">
              {t('business.primaryActivities')}
            </p>
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
            <label className="block text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Departments
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {departments.map((dept) => (
                <div
                  key={dept}
                  className="flex items-center gap-1.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded px-2.5 py-1"
                >
                  <span className="text-sm text-[var(--text-primary)]">{dept}</span>
                  <button
                    type="button"
                    onClick={() => setDepartments((d) => d.filter((x) => x !== dept))}
                    className="text-[var(--text-muted)] hover:text-[var(--accent-red)] transition-colors cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newDepartment}
                onChange={(e) => setNewDepartment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newDepartment.trim()) {
                    e.preventDefault()
                    if (!departments.includes(newDepartment.trim())) {
                      setDepartments((d) => [...d, newDepartment.trim()])
                    }
                    setNewDepartment('')
                  }
                }}
                placeholder="Add department and press Enter"
                className="flex-1 bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-blue)] transition-colors"
              />
              <button
                type="button"
                onClick={() => {
                  if (newDepartment.trim() && !departments.includes(newDepartment.trim())) {
                    setDepartments((d) => [...d, newDepartment.trim()])
                  }
                  setNewDepartment('')
                }}
                className="bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-[var(--border-active)] text-[var(--text-secondary)] px-3 py-2 rounded text-sm cursor-pointer transition-colors"
              >
                Add
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              e.g. Sales, Production, Accounts, HR
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-1">{t('business.teamSize')}</p>
            <input
              type="number"
              min={1}
              max={500}
              value={teamSize}
              onChange={(e) => setTeamSize(e.target.value)}
              placeholder={t('business.teamSizePlaceholder')}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className={`${cardClass} ${isSetup ? '' : 'md:col-span-2'}`}>
        <label className={sectionLabelClass}>{t('business.targetsSection')}</label>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-2">Target Unit</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSalesTargetUnit('amount')}
                className={`px-3 py-1.5 rounded text-sm border transition-colors cursor-pointer ${
                  salesTargetUnit === 'amount'
                    ? 'bg-[var(--bg-surface)] border-[var(--border-active)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)]'
                }`}
              >
                ₹ Amount
              </button>
              <button
                type="button"
                onClick={() => setSalesTargetUnit('units')}
                className={`px-3 py-1.5 rounded text-sm border transition-colors cursor-pointer ${
                  salesTargetUnit === 'units'
                    ? 'bg-[var(--bg-surface)] border-[var(--border-active)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)]'
                }`}
              >
                Units
              </button>
            </div>
            {salesTargetUnit !== 'amount' && (
              <input
                type="text"
                value={salesTargetUnitLabel}
                onChange={(e) => setSalesTargetUnitLabel(e.target.value)}
                placeholder="e.g. houses, flats, clients, orders"
                className="mt-2 w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-blue)] transition-colors"
              />
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-[var(--text-secondary)] mb-1">
                {salesTargetUnit === 'amount' ? t('business.yearlySalesTarget') : 'Yearly Target'}
              </p>
              <div className="flex items-center gap-2">
                {salesTargetUnit === 'amount' && (
                  <span className="text-sm text-[var(--text-muted)] font-mono">₹</span>
                )}
                <input
                  type="number"
                  value={monthlySalesTarget}
                  onChange={(e) => setMonthlySalesTarget(e.target.value)}
                  placeholder={salesTargetUnit === 'amount' ? 'e.g. 12000000' : 'e.g. 50'}
                  className={inputClass}
                />
              </div>
            </div>
            {salesTargetUnit === 'amount' && (
              <div>
                <p className="text-xs text-[var(--text-secondary)] mb-1">
                  {t('business.yearlyCollectionTarget')}
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
            )}
          </div>
          {monthlySalesTarget && (
            <>
              {daysRemainingWarning !== null && (
                <div className="w-full border border-[var(--accent-yellow)]/40 bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)] rounded px-3 py-2 text-sm">
                  {daysRemainingWarning} days remaining in this month - target will be prorated.
                </div>
              )}
              <button
                type="button"
                onClick={generateTargets}
                disabled={generatingTargets}
                className="w-full bg-transparent border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)] hover:text-[var(--text-primary)] text-sm py-2.5 px-4 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {generatingTargets ? t('business.generating') : t('business.generateMonthlyPlan')}
              </button>
            </>
          )}

          {targetsGenerated && monthlyTargets.length > 0 && (
            <div className="mt-2 border border-[var(--border-subtle)] rounded-lg px-3 py-2">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                <p className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-widest">
                  {t('business.monthlyBreakdown')}
                </p>
                <p className={`text-sm font-mono ${totalColorClass}`}>
                  {salesTargetUnit === 'amount'
                    ? `${t('business.total')}: ₹${monthlySalesTotal}`
                    : `${t('business.total')}: ${monthlySalesTotal} ${activeUnitLabel}`}
                </p>
              </div>

              <div>
                {monthlyTargets.map((item, index) => {
                  const monthPart = Number(item.year_month.split('-')[1] ?? 1)
                  const monthLabel = getMonthName(Math.max(0, Math.min(11, monthPart - 1)), true)
                  return (
                    <div
                      key={item.year_month}
                      className="flex items-center gap-3 py-2 border-b border-[var(--border-subtle)]"
                    >
                      <div className="w-32 shrink-0">
                        <p className="text-sm text-[var(--text-primary)]">{monthLabel}</p>
                        <p className="text-xs font-mono text-[var(--text-muted)]">
                          {item.year_month}
                        </p>
                      </div>
                      <span className="text-sm text-[var(--text-muted)] font-mono w-12 shrink-0">
                        {salesTargetUnit === 'amount' ? '₹' : activeUnitLabel}
                      </span>
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
                      {salesTargetUnit !== 'amount' ? (
                        <span className="text-xs text-[var(--text-muted)] w-20 shrink-0">
                          {activeUnitLabel}
                        </span>
                      ) : (
                        <>
                          <span className="text-sm text-[var(--text-muted)] font-mono w-12 shrink-0">
                            {salesTargetUnit === 'amount' ? '₹' : activeUnitLabel}
                          </span>
                          <input
                            type="number"
                            value={item.collection_target}
                            onChange={(e) => {
                              const value = Number(e.target.value || 0)
                              setMonthlyTargets((prev) =>
                                prev.map((target, targetIndex) =>
                                  targetIndex === index
                                    ? { ...target, collection_target: value }
                                    : target,
                                ),
                              )
                            }}
                            className={inputClass}
                          />
                        </>
                      )}
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
                {savingTargets ? t('business.savingTargets') : t('business.saveTargets')}
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
              <h1 className="text-xl font-semibold text-[var(--text-primary)]">
                {t('business.title')}
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                {t('business.setupSubtitle')}
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
                    {saving ? t('business.saving') : t('business.continue')}
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
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            {t('business.title')}
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">{t('business.editSubtitle')}</p>
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
                {saving ? t('business.saving') : t('business.saveProfile')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
