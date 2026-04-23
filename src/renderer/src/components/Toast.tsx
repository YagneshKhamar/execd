import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

type ToastType = 'error' | 'success' | 'info'

interface ToastItemData {
  id: string
  type: ToastType
  message: string
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
  error: (message: string) => void
  success: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}

const ICONS = {
  error: AlertCircle,
  success: CheckCircle,
  info: Info,
}

const STYLES = {
  error: 'border-[var(--accent-red)]/50 bg-[#1a0a0a] text-[var(--accent-red)]',
  success: 'border-[var(--accent-green)]/50 bg-[#0a1a0a] text-[var(--accent-green)]',
  info: 'border-[var(--border-active)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
}

const ICON_STYLES = {
  error: 'text-[var(--accent-red)]',
  success: 'text-[var(--accent-green)]',
  info: 'text-[var(--text-primary)]',
}

function ToastItem({
  item,
  onRemove,
}: {
  item: ToastItemData
  onRemove: (id: string) => void
}): React.JSX.Element {
  useEffect(() => {
    const t = setTimeout(() => onRemove(item.id), 4000)
    return () => clearTimeout(t)
  }, [item.id, onRemove])

  const Icon = ICONS[item.type]
  const iconStyle = ICON_STYLES[item.type]

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded border text-sm max-w-sm w-full shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-sm ${STYLES[item.type]}`}
      style={{ animation: 'slideIn 0.15s ease-out' }}
    >
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconStyle}`} />
      <p
        className="flex-1 leading-snug overflow-hidden"
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {item.message}
      </p>
      <button
        onClick={() => onRemove(item.id)}
        className="shrink-0 opacity-50 hover:opacity-100 cursor-pointer transition-opacity"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastItemData[]>([])

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev.slice(-4), { id, type, message }])
  }, [])

  const error = useCallback((message: string) => toast(message, 'error'), [toast])
  const success = useCallback((message: string) => toast(message, 'success'), [toast])
  const info = useCallback((message: string) => toast(message, 'info'), [toast])

  return (
    <ToastContext.Provider value={{ toast, error, success, info }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 items-end">
        {toasts.map((item) => (
          <ToastItem key={item.id} item={item} onRemove={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
