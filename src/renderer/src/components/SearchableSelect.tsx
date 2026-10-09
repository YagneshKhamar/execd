import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export interface SelectOption {
  value: string
  label: string
  tag?: string
  tagColor?: 'blue' | 'green' | 'yellow' | 'orange' | 'red'
}

interface SearchableSelectProps {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchable?: boolean
  disabled?: boolean
}

const TAG_COLORS: Record<string, string> = {
  blue: 'bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20',
  green:
    'bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20',
  yellow:
    'bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)] border border-[var(--accent-yellow)]/20',
  orange:
    'bg-[var(--accent-orange)]/10 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20',
  red: 'bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/20',
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  searchable = false,
  disabled = false,
}: SearchableSelectProps): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(-1)

  const selected = options.find((o) => o.value === value)

  const filtered =
    searchable && query.trim()
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(query.toLowerCase()) ||
            (o.tag ?? '').toLowerCase().includes(query.toLowerCase()),
        )
      : options

  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [open, searchable])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && filtered[activeIndex]) {
        onChange(filtered[activeIndex].value)
        setOpen(false)
        setQuery('')
        setActiveIndex(-1)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
      setActiveIndex(-1)
    }
  }

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  return (
    <div ref={containerRef} className="relative w-full" onKeyDown={handleKeyDown}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          if (!open) {
            const rect = containerRef.current?.getBoundingClientRect()
            if (rect) {
              const spaceBelow = window.innerHeight - rect.bottom
              const spaceAbove = rect.top
              setOpenUpward(spaceBelow < 240 && spaceAbove > spaceBelow)
            }
          }
          setOpen((o) => !o)
        }}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded
          bg-[var(--bg-elevated)] border text-sm text-left transition-colors
          ${open ? 'border-[var(--accent-blue)]' : 'border-[var(--border-default)] hover:border-[var(--border-active)]'}
          ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <span className="flex items-center gap-2 flex-1 min-w-0">
          {selected ? (
            <>
              {selected.tag && (
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0 ${TAG_COLORS[selected.tagColor ?? 'blue']}`}
                >
                  {selected.tag}
                </span>
              )}
              <span className="text-[var(--text-primary)] truncate">{selected.label}</span>
            </>
          ) : (
            <span className="text-[var(--text-muted)]">{placeholder ?? t('common.select')}</span>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-[var(--text-muted)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className={`absolute z-50 w-full rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-xl overflow-hidden
  ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}
`}
        >
          {searchable && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)]">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActiveIndex(0)
                }}
                placeholder={t('common.search')}
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
              />
            </div>
          )}

          <div ref={listRef} className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-[var(--text-muted)] text-center">
                {t('common.noResults')}
              </div>
            ) : (
              filtered.map((option, i) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                    setQuery('')
                    setActiveIndex(-1)
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors cursor-pointer
                    ${i === activeIndex ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'}
                    ${option.value === value ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}
                  `}
                >
                  {option.tag && (
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0 ${TAG_COLORS[option.tagColor ?? 'blue']}`}
                    >
                      {option.tag}
                    </span>
                  )}
                  <span className="flex-1 truncate">{option.label}</span>
                  {option.value === value && (
                    <Check className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
