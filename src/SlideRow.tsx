import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useData } from './data'
import { NeedDetailSheet, StoreLogo, StorePickerSheet } from './components'
import { IconNote } from './icons'
import { articleFor, logoUrl } from './lib'
import { WhoDot } from './Pending'
import type { Item, Tab } from './types'

// Soglia di aggancio (quota del percorso) e quanto "pesa" la resistenza iniziale.
const SNAP = 0.45
const RESIST = 0.38

/** Posizione mostrata (0..1) in base a quanto il dito ha percorso verso l'altro lato. */
function pull(q: number, locked: boolean): number {
  if (q < 0) return -0.12 * (1 - Math.exp(q * 3)) // verso il lato opposto: elastico corto
  if (locked) return 1 + Math.min(0.05, (q - 1) * 0.1) // agganciato: resta incollato al bordo
  return RESIST * Math.pow(Math.min(q, SNAP) / SNAP, 1.7) // prima della soglia: resistenza
}

export function SlideRow({
  item,
  goto,
  pickStore = true,
  fadeFrom,
  hint,
  tour,
  onEdit,
}: {
  item: Item
  goto: (t: Tab) => void
  pickStore?: boolean
  tour?: string // punto evidenziabile dalla Guida
  onEdit?: () => void // tocco su un prodotto che non manca (solo admin, in Elencone): modifica
  hint?: number // ritardo (ms) con cui la riga fa una piccola oscillazione per suggerire che si trascina
  fadeFrom?: number // se presente: da quel momento (ms) la riga sfuma fino al 30% in 5 secondi
}) {
  const d = useData()
  const [picking, setPicking] = useState(false)
  const [detail, setDetail] = useState(false)
  const dragged = useRef(false)
  const [peek, setPeek] = useState(false) // nota aperta dentro del pulsante (Cosa manca)
  const noteRef = useRef<HTMLDivElement>(null)
  const [noteH, setNoteH] = useState(0)
  const peekTimer = useRef<number | undefined>(undefined)
  const closePeek = () => {
    window.clearTimeout(peekTimer.current)
    setPeek(false)
  }
  useEffect(() => () => window.clearTimeout(peekTimer.current), [])
  const [tip, setTip] = useState(false) // nome del negozio quando manca il logo
  const tipTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(tipTimer.current), [])
  const need = d.needByItem.get(item.id)
  const store = need ? d.storeOf(need.store_id) : undefined
  useEffect(() => {
    if (!need?.note) closePeek()
  }, [need?.note])
  const rowRef = useRef<HTMLLIElement>(null)
  const drag = useRef<{
    id: number
    x: number
    y: number
    side: 0 | 1
    travel: number
    on: boolean
    locked: boolean
  } | null>(null)
  const [f, setF] = useState<number | null>(null) // posizione durante il trascinamento
  const [snapAnim, setSnapAnim] = useState(false)
  const [pend, setPend] = useState<0 | 1 | null>(null) // destinazione dopo il rilascio, finché i dati non si aggiornano
  const side: 0 | 1 = need ? 1 : 0
  const hasWho = Boolean(need && item.recurrence === 'one_off' && d.whoOf(item.created_by))
  const hasSlot = Boolean(need && (pickStore || store))
  const label = need?.quantity ? `${need.quantity} di ${item.name}` : item.name
  // se il nome non sta in una riga il pulsante si allunga quanto serve e il nome va a capo
  const sliderRef = useRef<HTMLDivElement>(null)
  const measRef = useRef<HTMLSpanElement>(null)
  const [extra, setExtra] = useState(0)
  const hasNote = Boolean(need?.note)
  const isNeed = Boolean(need)
  const crowded = hasWho && hasSlot
  useLayoutEffect(() => {
    const s = sliderRef.current
    const m = measRef.current
    if (!s || !m) return
    const run = () => {
      const w = s.clientWidth - 32 - (isNeed ? 43 + (crowded ? 33 : 0) : 0) - (hasNote ? 24 : 0)
      if (w <= 0) return
      m.style.width = `${w}px`
      setExtra((Math.max(1, Math.round(m.offsetHeight / 20)) - 1) * 20)
    }
    run()
    const ro = new ResizeObserver(run)
    ro.observe(s)
    return () => ro.disconnect()
  }, [label, isNeed, crowded, hasNote])
  const [wig, setWig] = useState<number | null>(null)
  const side0 = need ? 1 : 0
  useEffect(() => {
    if (hint === undefined || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    // piccola oscillazione verso l'altro lato, due volte (la seconda più breve)
    const away = side0 === 1 ? 1 - 0.34 : 0.34
    const away2 = side0 === 1 ? 1 - 0.18 : 0.18
    const steps: [number, number][] = [
      [hint, away],
      [hint + 300, side0],
      [hint + 560, away2],
      [hint + 820, side0],
      [hint + 1100, -1],
    ]
    const ts = steps.map(([t, v]) => window.setTimeout(() => setWig(v < 0 ? null : v), t))
    return () => ts.forEach((t) => window.clearTimeout(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint])
  const [fade, setFade] = useState<{ o: number; ms: number }>({ o: 1, ms: 250 })
  useEffect(() => {
    if (fadeFrom === undefined) {
      setFade({ o: 1, ms: 250 })
      return
    }
    const FADE_MS = 5000
    const left = FADE_MS - (Date.now() - fadeFrom)
    if (left <= 0) {
      setFade({ o: 0.3, ms: 0 })
      return
    }
    setFade({ o: 1 - (0.7 * (FADE_MS - left)) / FADE_MS, ms: 0 })
    const t = window.setTimeout(() => setFade({ o: 0.3, ms: left }), 30)
    return () => window.clearTimeout(t)
  }, [fadeFrom])

  // Dopo il rilascio i dati passano per uno stato intermedio (operazione locale -> server -> aggiornamento)
  // che può far rimbalzare "manca" per un attimo: tengo ferma la posizione scelta finché si assesta.
  useEffect(() => {
    if (pend === null) return
    const t = window.setTimeout(() => setPend(null), 2000)
    return () => window.clearTimeout(t)
  }, [pend])

  const pos = f ?? wig ?? pend ?? side
  const shown = Math.max(-0.1, Math.min(1.06, pos))
  const mix = Math.max(0, Math.min(1, pos))

  function flash() {
    setSnapAnim(true)
    window.setTimeout(() => setSnapAnim(false), 190)
  }

  function onDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const w = rowRef.current?.offsetWidth ?? 300
    setPend(null)
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      side,
      travel: w * 0.21,
      on: false,
      locked: false,
    }
  }

  function onMove(e: React.PointerEvent) {
    const g = drag.current
    if (!g || g.id !== e.pointerId) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (!g.on) {
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return
      g.on = true
      closePeek() // se inizia un trascinamento la nota si richiude
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    const q = (g.side === 0 ? dx : -dx) / g.travel
    const locked = g.locked ? q > SNAP * 0.7 : q >= SNAP // isteresi: per sganciarsi serve tornare indietro un po'
    if (locked !== g.locked) {
      g.locked = locked
      flash()
      navigator.vibrate?.(locked ? 12 : 6)
    }
    const off = pull(q, locked)
    setF(g.side === 0 ? off : 1 - off)
  }

  function end(e: React.PointerEvent, cancelled: boolean) {
    const g = drag.current
    if (!g || g.id !== e.pointerId) return
    drag.current = null
    if (!g.on) return
    dragged.current = true // il "click" che segue un trascinamento non deve aprire i dettagli
    window.setTimeout(() => (dragged.current = false), 350)
    flash()
    setF(null)
    if (g.locked && !cancelled) {
      setPend(g.side === 0 ? 1 : 0)
      if (g.side === 0) d.toggleMissing(item)
      else if (need) d.markBought(need)
    }
  }

  // Tastiera / lettori di schermo: nessun trascinamento, quindi un attivatore semplice.
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ' || (e.key === 'ArrowRight' && !need) || (e.key === 'ArrowLeft' && need)) {
      e.preventDefault()
      if (need) d.markBought(need)
      else d.toggleMissing(item)
    }
  }

  return (
    <li
      className="slrow"
      data-tour={tour}
      ref={rowRef}
      style={{
        ['--o' as string]: fade.o,
        ['--h' as string]: `${49 + extra}px`,
        height: peek ? 49 + extra + noteH : 49 + extra,
        transition: `${fade.ms ? `--o ${fade.ms}ms linear, ` : ''}height 0.4s cubic-bezier(0.2, 0.8, 0.3, 1)`,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        ref={sliderRef}
        className={
          'slider' + (peek ? ' peek' : '') + (f !== null ? ' dragging' : '') + (snapAnim || f === null ? ' glide' : '')
        }
        style={{
          ['--f' as string]: shown,
          ['--m' as string]: mix,
          ['--x' as string]: hasWho && hasSlot ? '33px' : '0px',
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={(e) => end(e, false)}
        onPointerCancel={(e) => end(e, true)}
        onClick={() => {
          // un tocco su un prodotto che manca apre quantità e nota (sul "click", così il tocco non cade nella finestra appena aperta)
          if (dragged.current) return
          if (!need) return onEdit?.()
          if (pickStore) setDetail(true)
          else if (need.note) {
            // in Cosa manca la nota si apre dentro al pulsante e si richiude da sola dopo 7 secondi
            if (peek) return closePeek()
            setNoteH((noteRef.current?.offsetHeight ?? 0) + 14)
            setPeek(true)
            window.clearTimeout(peekTimer.current)
            peekTimer.current = window.setTimeout(() => setPeek(false), 7000)
          }
        }}
        onKeyDown={onKey}
        aria-pressed={Boolean(need)}
        aria-label={
          need
            ? `${item.name}: manca. Trascina a sinistra quando l'hai preso`
            : `${item.name}: trascina a destra se manca`
        }
      >
        <span className="slname">
          {label}
          {need?.note && (
            <span className="slmeta note" aria-label="Con nota">
              <IconNote />
            </span>
          )}
        </span>
        <span className="slmeasure" ref={measRef} aria-hidden="true">
          {label}
        </span>
        {need?.note && !pickStore && (
          <div className="slnote" aria-hidden={!peek}>
            <div className="slnote-in" ref={noteRef}>
              {need.note}
            </div>
          </div>
        )}
        {need && !pickStore && store && (
          logoUrl(store.logo) ? (
            <span className="slstore set static" aria-label={`Negozio: ${store.name}`}>
              <StoreLogo store={store} size={27} />
            </span>
          ) : (
            <>
              <button
                type="button"
                className="slstore set static tap"
                aria-label={`Negozio: ${store.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (dragged.current) return
                  setTip(true)
                  window.clearTimeout(tipTimer.current)
                  tipTimer.current = window.setTimeout(() => setTip(false), 2500)
                }}
              >
                <StoreLogo store={store} size={27} />
              </button>
              <span className={'slstore-tip' + (tip ? ' on' : '')} aria-hidden="true">
                {store.name}
              </span>
            </>
          )
        )}
        {need && item.recurrence === 'one_off' && (
          <WhoDot userId={item.created_by} className={(!pickStore && store) || pickStore ? 'beside' : ''} />
        )}
        {need && pickStore && (
          <button
            type="button"
            className={'slstore' + (store ? ' set' : '')}
            onClick={(e) => {
              e.stopPropagation()
              setPicking(true)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label={
              store
                ? `Dove prendere ${item.name}: ${store.name}. Tocca per cambiare`
                : `Scegli dove prendere ${item.name}`
            }
          >
            {store ? <StoreLogo store={store} size={27} /> : '+'}
          </button>
        )}
      </div>
      {detail && need && (
        <NeedDetailSheet
          title={item.name}
          quantity={need.quantity}
          note={need.note}
          onSave={(q, n) => d.setNeedDetail(need.id, q, n)}
          onClose={() => setDetail(false)}
        />
      )}
      {picking && need && (
        <StorePickerSheet
          title={`Dove prendi ${articleFor(item.name)}${item.name}?`}
          current={need.store_id}
          onPick={(id) => {
            d.setNeedStore(need.id, id)
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
          goStores={() => goto('stores')}
        />
      )}
    </li>
  )
}
