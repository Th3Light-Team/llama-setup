import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  title: string
  description?: string
  variant: ToastVariant
  durationMs?: number
}

interface ToastContextValue {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

// ─── Context ────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return { ...ctx, toast: ctx.addToast }
}

// ─── Provider ───────────────────────────────────────────────────

let toastCounter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${++toastCounter}`
    setToasts(prev => [...prev, { ...toast, id }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastViewport toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  )
}

// ─── Viewport (renders the toast stack) ─────────────────────────

function ToastViewport({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 pointer-events-none">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

// ─── Single Toast ───────────────────────────────────────────────

const VARIANT_CONFIG: Record<ToastVariant, { icon: React.ReactNode; classes: string }> = {
  success: {
    icon: <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />,
    classes: 'border-green-500/30 bg-green-50/90 dark:bg-green-950/80'
  },
  error: {
    icon: <XCircle className="w-4 h-4 text-red-500 shrink-0" />,
    classes: 'border-red-500/30 bg-red-50/90 dark:bg-red-950/80'
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />,
    classes: 'border-amber-500/30 bg-amber-50/90 dark:bg-amber-950/80'
  },
  info: {
    icon: <Info className="w-4 h-4 text-blue-500 shrink-0" />,
    classes: 'border-blue-500/30 bg-blue-50/90 dark:bg-blue-950/80'
  }
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [isExiting, setIsExiting] = useState(false)
  const config = VARIANT_CONFIG[toast.variant]
  const duration = toast.durationMs ?? 4000

  useEffect(() => {
    const exitTimer = setTimeout(() => setIsExiting(true), duration - 300)
    const removeTimer = setTimeout(onDismiss, duration)
    return () => {
      clearTimeout(exitTimer)
      clearTimeout(removeTimer)
    }
  }, [duration, onDismiss])

  return (
    <div
      className={`
        pointer-events-auto rounded-lg border p-3 shadow-lg backdrop-blur-sm
        transition-all duration-300 ease-out
        ${isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0 animate-in slide-in-from-right-4'}
        ${config.classes}
      `}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5">{config.icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">{toast.title}</p>
          {toast.description && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{toast.description}</p>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0 -mr-1 -mt-0.5"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
