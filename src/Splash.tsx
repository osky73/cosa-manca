import { useEffect, useState } from 'react'

const KEY = 'cm.splash'

function already(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Copertina verde mostrata una volta a ogni apertura dell'app: il titolo si accende, poi tutto si dissolve. */
export default function Splash() {
  const [phase, setPhase] = useState<'on' | 'out' | 'gone'>(() => (already() ? 'gone' : 'on'))

  useEffect(() => {
    if (phase === 'gone') return
    try {
      sessionStorage.setItem(KEY, '1')
    } catch {
      /* ignora */
    }
    const t1 = window.setTimeout(() => setPhase('out'), 2600)
    const t2 = window.setTimeout(() => setPhase('gone'), 3200)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [phase === 'gone'])

  if (phase === 'gone') return null
  return (
    <div className={'splash' + (phase === 'out' ? ' out' : '')} onClick={() => setPhase('gone')} role="presentation">
      <h1 className="splash-t">Cosa manca</h1>
      <p className="splash-s">Sai quando chiami a casa e chiedi «cosa manca?» e nessuno ha voglia di andare a vedere? Ecco fatto.</p>
    </div>
  )
}
