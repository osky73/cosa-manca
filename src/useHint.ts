import { useEffect, useState } from 'react'

/** True solo nei primi secondi dopo l'ingresso in una schermata: serve a far "ondeggiare" le prime righe. */
export function useHintWindow(ms = 4000): boolean {
  const [on, setOn] = useState(true)
  useEffect(() => {
    const t = window.setTimeout(() => setOn(false), ms)
    return () => window.clearTimeout(t)
  }, [ms])
  return on
}
