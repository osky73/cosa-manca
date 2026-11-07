import { useEffect, useState } from 'react'

interface BIPEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: string }>
}

let deferred: BIPEvent | null = null
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BIPEvent
    listeners.forEach((l) => l())
  })
}

export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  const isIOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  return {
    standalone,
    isIOS,
    canPrompt: deferred !== null,
    prompt: async () => {
      if (!deferred) return
      await deferred.prompt()
      await deferred.userChoice
      deferred = null
      listeners.forEach((l) => l())
    },
  }
}

export function InstallCard({ onDismiss, loginHint }: { onDismiss?: () => void; loginHint?: boolean }) {
  const inst = useInstall()
  if (inst.standalone) return null
  return (
    <section className="card install">
      <div className="install-head">
        <strong>Metti l'app sulla Home del telefono</strong>
        {onDismiss && (
          <button className="link" onClick={onDismiss}>
            Non ora
          </button>
        )}
      </div>
      {inst.canPrompt ? (
        <button className="btn primary" onClick={() => void inst.prompt()}>
          Installa l'app
        </button>
      ) : inst.isIOS ? (
        <ol>
          <li>
            Tocca <b>Condividi</b> (il quadrato con la freccia) in Safari
          </li>
          <li>
            Scegli <b>Aggiungi alla schermata Home</b>
          </li>
          <li>Apri l'app dalla Home e accedi da lì</li>
        </ol>
      ) : (
        <p>
          Dal menu del browser scegli <b>Installa app</b> oppure <b>Aggiungi a schermata Home</b>.
        </p>
      )}
      {loginHint && inst.isIOS && (
        <p className="hint">Su iPhone conviene installare l'app prima di accedere: l'accesso fatto in Safari non passa all'app.</p>
      )}
    </section>
  )
}
