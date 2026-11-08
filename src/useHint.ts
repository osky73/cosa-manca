import { useEffect, useState } from 'react'

function seen(key: string): boolean {
  try {
    return localStorage.getItem('cm.hint.' + key) === '1'
  } catch {
    return false
  }
}

/** True solo la prima volta che si entra in una schermata (e solo se c'è almeno una riga): serve a far "ondeggiare" una riga. */
export function useHintWindow(key: string, hasRows: boolean, ms = 4000): boolean {
  const [on, setOn] = useState(() => !seen(key))
  useEffect(() => {
    if (!on || !hasRows) return
    try {
      localStorage.setItem('cm.hint.' + key, '1')
    } catch {
      /* ignora */
    }
    const t = window.setTimeout(() => setOn(false), ms)
    return () => window.clearTimeout(t)
  }, [on, hasRows, key, ms])
  return on
}
