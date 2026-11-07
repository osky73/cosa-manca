import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface ToastAction {
  label: string
  run: () => void
}
interface ToastItem {
  msg: string
  action?: ToastAction
}

const Ctx = createContext<{ show: (msg: string, action?: ToastAction) => void }>({ show: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<ToastItem | null>(null)
  const timer = useRef<number>(0)

  const show = useCallback((msg: string, action?: ToastAction) => {
    window.clearTimeout(timer.current)
    setT({ msg, action })
    timer.current = window.setTimeout(() => setT(null), action ? 6000 : 3500)
  }, [])

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {t && (
        <div className="toast" role="status">
          <span>{t.msg}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action?.run()
                setT(null)
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
