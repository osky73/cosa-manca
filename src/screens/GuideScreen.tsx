import { useState } from 'react'
import { TOURS } from '../tours'
import { readLS, writeLS } from '../lib'
import type { Tab } from '../types'

const STEPS: { pre: string; link: string; tab: Tab; post: string }[] = [
  { pre: 'Invita le persone al tuo ', link: 'Gruppo', tab: 'group', post: '' },
  { pre: 'Personalizza il tuo ', link: 'Elencone', tab: 'list', post: '' },
  { pre: 'Aggiungi ', link: 'Negozi', tab: 'stores', post: ' se ti servono' },
  { pre: 'Inizia a swipare i ', link: 'prodotti mancanti', tab: 'list', post: '' },
  { pre: 'Fai la spesa seguendo ', link: 'Cosa manca', tab: 'shop', post: '' },
]

export default function GuideScreen({ onTour, goto }: { onTour: (id: string) => void; goto: (t: Tab) => void }) {
  const [open, setOpen] = useState<boolean>(() => readLS<boolean>('cm_start_open', true))
  function toggle() {
    setOpen((o) => {
      writeLS('cm_start_open', !o)
      return !o
    })
  }
  return (
    <div className="screen">
      <header className="top">
        <h1>Guida</h1>
        <p className="tagline">Tocca una domanda: ti porto nel punto dell'app e te lo mostro.</p>
      </header>
      <section className="start">
        <button className="start-head" onClick={toggle} aria-expanded={open}>
          <h2>Come iniziare</h2>
          <span className={'chev' + (open ? ' open' : '')} aria-hidden="true" />
        </button>
        {open && (
          <ol className="start-steps">
            {STEPS.map((s) => (
              <li key={s.link + s.tab}>
                {s.pre}
                <button className="start-link" onClick={() => goto(s.tab)}>
                  {s.link}
                </button>
                {s.post}
              </li>
            ))}
          </ol>
        )}
      </section>
      <div className="guide-list">
        {TOURS.map((t) => (
          <button key={t.id} className="guide-card guide-q" onClick={() => onTour(t.id)}>
            <h3>{t.question}</h3>
            <span className="meta">Mostrami →</span>
          </button>
        ))}
      </div>
    </div>
  )
}
