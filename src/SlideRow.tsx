import { useEffect, useRef, useState } from 'react'
import { useData } from './data'
import { StoreLogo, StorePickerSheet } from './components'
import { articleFor } from './lib'
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
}: {
  item: Item
  goto: (t: Tab) => void
  pickStore?: boolean
  fadeFrom?: number // se presente: da quel momento (ms) la riga sfuma fino al 30% in 5 secondi
}) {
  const d = useData()
  const [picking, setPicking] = useState(false)
  const need = d.needByItem.get(item.id)
  const store = need ? d.storeOf(need.store_id) : undefined
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

  const pos = f ?? pend ?? side
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
      ref={rowRef}
      style={{ opacity: fade.o, transition: fade.ms ? `opacity ${fade.ms}ms linear` : 'none' }}
    >
      <div
        role="button"
        tabIndex={0}
        className={'slider' + (f !== null ? ' dragging' : '') + (snapAnim || f === null ? ' glide' : '')}
        style={{ ['--f' as string]: shown, ['--m' as string]: mix }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={(e) => end(e, false)}
        onPointerCancel={(e) => end(e, true)}
        onKeyDown={onKey}
        aria-pressed={Boolean(need)}
        aria-label={
          need
            ? `${item.name}: manca. Trascina a sinistra quando l'hai preso`
            : `${item.name}: trascina a destra se manca`
        }
      >
        <span className="slname">{item.name}</span>
        {need && !pickStore && store && (
          <span className="slstore set static" aria-label={`Negozio: ${store.name}`}>
            <StoreLogo store={store} size={27} />
          </span>
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
                ? `Dove comprare ${item.name}: ${store.name}. Tocca per cambiare`
                : `Scegli dove comprare ${item.name}`
            }
          >
            {store ? <StoreLogo store={store} size={27} /> : '+'}
          </button>
        )}
      </div>
      {picking && need && (
        <StorePickerSheet
          title={`Dove compri ${articleFor(item.name)}${item.name}?`}
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
