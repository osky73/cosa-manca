import { useEffect, useState } from 'react'
import { readLS, writeLS } from './lib'

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

const DONE_KEY = 'cm.installed'
function installedFlag(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1'
  } catch {
    return false
  }
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
    /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

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
  const [done, setDone] = useState(installedFlag)
  if (inst.standalone || done) return null
  function markDone() {
    try {
      localStorage.setItem(DONE_KEY, '1')
    } catch {
      /* ignora */
    }
    setDone(true)
  }
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
      <button type="button" className="btn ghost wide" onClick={markDone}>
        Sì, l'ho già fatto
      </button>
      {loginHint && inst.isIOS && (
        <p className="hint">
          Su iPhone conviene installare l'app prima di accedere: l'accesso fatto in Safari non passa all'app.
        </p>
      )}
    </section>
  )
}

// ---------- Pop-up "salva l'app sul telefono" (dopo il login) ----------

const POP_KEY = 'cm.installpop'
const MAX_SHOWS = 3 // la prima volta + 2 promemoria, poi basta
const REMIND_AFTER_OPENS = 3

interface PopState {
  dismissed: number
  opens: number // aperture dell'app dall'ultimo "Continua senza"
}

function isAndroid() {
  return /android/i.test(navigator.userAgent)
}

/** iPhone con il link aperto dentro un'altra app (WhatsApp, Mail, Instagram…): lì manca "Aggiungi alla Home". */
function isIOSInApp() {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) && !/Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

function IconShare() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15V3M8 7l4-4 4 4" />
      <path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
    </svg>
  )
}

function IconAddHome() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

export function InstallPopup() {
  const inst = useInstall()
  const [show, setShow] = useState(false)

  useEffect(() => {
    // conta una apertura per sessione
    const st = readLS<PopState>(POP_KEY, { dismissed: 0, opens: 0 })
    if (!sessionStorage.getItem('cm.installpop.counted')) {
      sessionStorage.setItem('cm.installpop.counted', '1')
      if (st.dismissed > 0) st.opens += 1
      writeLS(POP_KEY, st)
    }
    if (installedFlag()) return setShow(false)
    const due = st.dismissed === 0 || (st.dismissed < MAX_SHOWS && st.opens >= REMIND_AFTER_OPENS)
    setShow(due)
  }, [])

  const mobile = inst.isIOS || isAndroid()
  if (!show || inst.standalone || !mobile) return null

  function later() {
    const st = readLS<PopState>(POP_KEY, { dismissed: 0, opens: 0 })
    writeLS(POP_KEY, { dismissed: st.dismissed + 1, opens: 0 })
    setShow(false)
  }

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="ip-title">
      <div className="backdrop" />
      <div className={'sheet ipop' + (inst.isIOS ? ' ios' : '')}>
        <img src="/pwa-192.png" width="64" height="64" alt="" className="ipop-icon" />
        <h2 id="ip-title">Per usare Cosa manca la cosa migliore è salvarla sul tuo smartphone</h2>
        <p className="hint">
          Così la apri con un tocco dalla Home, a schermo intero, come un'app vera. Ci vuole mezzo minuto.
        </p>

        {inst.isIOS ? (
          <>
            {isIOSInApp() && (
              <p className="ipop-warn">
                Stai usando un'altra app (WhatsApp, Mail…). Tocca <b>⋯</b> o l'icona della bussola e scegli{' '}
                <b>Apri in Safari</b>: poi torna qui.
              </p>
            )}
            <ol className="ipop-steps">
              <li>
                <span className="ipop-ico">
                  <IconShare />
                </span>
                <span>
                  Tocca <b>Condividi</b>, il quadrato con la freccia in basso
                </span>
              </li>
              <li>
                <span className="ipop-ico">
                  <IconAddHome />
                </span>
                <span>
                  Scorri e scegli <b>Aggiungi alla schermata Home</b>
                </span>
              </li>
              <li>
                <span className="ipop-ico">✓</span>
                <span>
                  Tocca <b>Aggiungi</b>, poi apri l'app dalla Home
                </span>
              </li>
            </ol>
          </>
        ) : inst.canPrompt ? (
          <button className="btn primary big" onClick={() => void inst.prompt()}>
            Aggiungi alla Home
          </button>
        ) : (
          <ol className="ipop-steps">
            <li>
              <span className="ipop-ico">⋮</span>
              <span>Apri il menu del browser (i tre puntini in alto a destra)</span>
            </li>
            <li>
              <span className="ipop-ico">
                <IconAddHome />
              </span>
              <span>
                Scegli <b>Installa app</b> oppure <b>Aggiungi a schermata Home</b>
              </span>
            </li>
          </ol>
        )}

        <button className="link ipop-skip" onClick={later}>
          Continua senza
        </button>
      </div>
      {inst.isIOS && !isIOSInApp() && (
        <div className="ipop-arrow" aria-hidden="true">
          ↓
        </div>
      )}
    </div>
  )
}
