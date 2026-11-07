import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../data'
import { ProposeSheet, StoreLogo, StorePickerSheet } from '../components'
import { IconChevron, IconPlus, IconSearch, IconX } from '../icons'
import { byCategoryThenName, catRank, norm } from '../lib'
import type { Item, Tab } from '../types'

export default function ListScreen({ goto }: { goto: (t: Tab) => void }) {
  const d = useData()
  const [q, setQ] = useState('')
  const [proposeName, setProposeName] = useState<string | null>(null)

  const qn = norm(q)
  const visible = useMemo(() => d.items.filter((i) => !i.hidden), [d.items])

  // Blocchi per settore, sempre nello stesso ordine: spostare un prodotto non cambia la sua posizione.
  const blocks = useMemo(() => {
    const m = new Map<string, Item[]>()
    for (const i of [...visible].sort(byCategoryThenName)) m.set(i.category, [...(m.get(i.category) ?? []), i])
    return [...m.entries()].sort((a, b) => catRank(a[0]) - catRank(b[0]) || a[0].localeCompare(b[0], 'it'))
  }, [visible])
  // All'inizio sono aperti solo i settori con prodotti che mancano, poi decide l'utente.
  const [open, setOpen] = useState<Set<string> | null>(null)
  useEffect(() => {
    if (open === null && d.loaded) {
      setOpen(new Set(visible.filter((i) => d.needByItem.has(i.id)).map((i) => i.category)))
    }
  }, [open, d.loaded, visible, d.needByItem])
  function toggleBlock(c: string) {
    const n = new Set(open ?? [])
    if (n.has(c)) n.delete(c)
    else n.add(c)
    setOpen(n)
  }
  const missingCount = d.needByItem.size

  const results = qn ? visible.filter((i) => norm(i.name).includes(qn)) : []
  const exact = qn ? visible.some((i) => norm(i.name) === qn) : false
  const pendingCount = d.suggestions.filter((s) => s.status === 'pending').length

  return (
    <div className="screen">
      <header className="top">
        <div className="top-row">
          <h1>Cosa manca</h1>
          {(!d.online || d.pendingOps > 0) && (
            <span className="pill warn">
              {d.online
                ? `${d.pendingOps} da inviare`
                : `Offline${d.pendingOps ? ` · ${d.pendingOps} da inviare` : ''}`}
            </span>
          )}
        </div>
        <p className="tagline">
          Sai quando chiami a casa e chiedi «cosa manca?» e nessuno ha voglia di andare a vedere? Ecco fatto.
        </p>
      </header>
      <div className="top sticky bar">
        <div className="searchbar">
          <IconSearch />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca o aggiungi un prodotto"
            enterKeyHint="search"
            aria-label="Cerca o aggiungi un prodotto"
          />
          {q && (
            <button className="icon-btn" onClick={() => setQ('')} aria-label="Cancella ricerca">
              <IconX />
            </button>
          )}
        </div>
        {!qn && (
          <div className="cols" aria-hidden="true">
            <span>Tutti</span>
            <span>
              Mancano
              {missingCount > 0 && <span className="count">{missingCount}</span>}
            </span>
          </div>
        )}
      </div>

      {d.isAdmin && pendingCount > 0 && !q && (
        <button className="banner" onClick={() => goto('sugg')}>
          {pendingCount === 1 ? '1 suggerimento da approvare' : `${pendingCount} suggerimenti da approvare`} →
        </button>
      )}

      {qn ? (
        <section>
          <ul className="rows">
            {results.map((item) => {
              const need = d.needByItem.get(item.id)
              return (
                <li key={item.id}>
                  <button className="row-main" onClick={() => d.toggleMissing(item)}>
                    <span className={'mark' + (need ? ' on' : '')}>{need ? '✓' : <IconPlus />}</span>
                    <span className="grow">
                      <span className="name">{item.name}</span>
                      <span className="meta">{need ? 'Manca · tocca per togliere' : item.category}</span>
                    </span>
                  </button>
                </li>
              )
            })}
            {!exact && (
              <li>
                <button className="row-main add-new" onClick={() => setProposeName(q.trim())}>
                  <span className="mark">
                    <IconPlus />
                  </span>
                  <span className="grow">
                    <span className="name">
                      {d.isAdmin ? 'Aggiungi' : 'Suggerisci'} «{q.trim()}»
                    </span>
                    <span className="meta">Non è nel catalogo</span>
                  </span>
                </button>
              </li>
            )}
          </ul>
        </section>
      ) : (
        <section>
          {blocks.length === 0 ? (
            <p className="empty">
              {d.loaded ? 'Il catalogo è vuoto. Aggiungi il primo prodotto.' : 'Carico la lista…'}
            </p>
          ) : (
            blocks.map(([cat, items]) => {
              const isOpen = open?.has(cat) ?? false
              const miss = items.filter((i) => d.needByItem.has(i.id)).length
              return (
                <div key={cat} className="cat">
                  <button className="cat-head" onClick={() => toggleBlock(cat)} aria-expanded={isOpen}>
                    <IconChevron open={isOpen} />
                    <span className="grow">{cat}</span>
                    {miss > 0 && (
                      <span className="count miss">
                        {miss} {miss === 1 ? 'manca' : 'mancano'}
                      </span>
                    )}
                    <span className="count">{items.length}</span>
                  </button>
                  {isOpen && (
                    <ul className="slist">
                      {items.map((item) => (
                        <SlideRow key={item.id} item={item} goto={goto} />
                      ))}
                    </ul>
                  )}
                </div>
              )
            })
          )}
          {d.stores.length === 0 && missingCount > 0 && d.isAdmin && (
            <p className="hint pad">
              Aggiungi i supermercati nella scheda Gruppo per indicare dove comprare ogni cosa.
            </p>
          )}
          <button className="btn ghost wide" onClick={() => setProposeName('')}>
            {d.isAdmin ? '+ Nuovo prodotto' : '+ Suggerisci un prodotto'}
          </button>
        </section>
      )}

      {proposeName !== null && (
        <ProposeSheet
          initialName={proposeName}
          onClose={() => setProposeName(null)}
          onDone={() => {
            setProposeName(null)
            setQ('')
          }}
        />
      )}
    </div>
  )
}

// Soglia di aggancio (quota del percorso) e quanto "pesa" la resistenza iniziale.
const SNAP = 0.45
const RESIST = 0.38

/** Posizione mostrata (0..1) in base a quanto il dito ha percorso verso l'altro lato. */
function pull(q: number, locked: boolean): number {
  if (q < 0) return -0.12 * (1 - Math.exp(q * 3)) // verso il lato opposto: elastico corto
  if (locked) return 1 + Math.min(0.05, (q - 1) * 0.1) // agganciato: resta incollato al bordo
  return RESIST * Math.pow(Math.min(q, SNAP) / SNAP, 1.7) // prima della soglia: resistenza
}

function SlideRow({ item, goto }: { item: Item; goto: (t: Tab) => void }) {
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
    <li className="slrow" ref={rowRef}>
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
        {need && (
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
            {store ? <StoreLogo store={store} size={30} /> : '+'}
          </button>
        )}
      </div>
      {picking && need && (
        <StorePickerSheet
          title={`Dove compri «${item.name}»?`}
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
