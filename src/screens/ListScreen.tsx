import { useEffect, useMemo, useRef, useState } from 'react'
import { useHintWindow } from '../useHint'
import { useData } from '../data'
import { ProposeSheet } from '../components'
import { SlideRow } from '../SlideRow'
import { IconGrip, IconPlus, IconSearch, IconTrash, IconX } from '../icons'
import { useToast } from '../toast'
import { catRank, categoriesOf, norm } from '../lib'
import type { Item, Tab } from '../types'

export default function ListScreen({ goto }: { goto: (t: Tab) => void }) {
  const d = useData()
  const [q, setQ] = useState('')
  const [proposeName, setProposeName] = useState<string | null>(null)
  const toast = useToast()
  const [mode, setMode] = useState<null | 'delete' | 'order'>(null) // solo admin: elimina o riordina i prodotti
  const deleting = mode === 'delete'
  const ordering = mode === 'order'
  const [drag, setDrag] = useState<{ id: string; label: string; x: number; y: number } | null>(null)
  const [drop, setDrop] = useState<{ cat: string; index: number } | null>(null)
  const dropRef = useRef<{ cat: string; index: number } | null>(null)
  const yRef = useRef(0)
  const dragId = useRef<string | null>(null)

  const qn = norm(q)
  const visible = useMemo(() => d.items.filter((i) => !i.hidden), [d.items])

  // Blocchi per settore, sempre nello stesso ordine: spostare un prodotto non cambia la sua posizione.
  const blocks = useMemo(() => {
    const m = new Map<string, Item[]>()
    if (ordering) for (const c of categoriesOf(visible)) m.set(c, [])
    const byOrder = (a: Item, b: Item) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name, 'it')
    for (const i of [...visible].sort(byOrder)) m.set(i.category, [...(m.get(i.category) ?? []), i])
    return [...m.entries()].sort((a, b) => catRank(a[0]) - catRank(b[0]) || a[0].localeCompare(b[0], 'it'))
  }, [visible, ordering])
  const missingCount = d.needByItem.size
  const hintIds = blocks
    .flatMap(([, items]) => items)
    .slice(0, 1)
    .map((i) => i.id)
  const hintOn = useHintWindow('list', hintIds.length > 0)
  const hintDelay = (id: string) => (hintIds.includes(id) ? 500 : undefined)

  const results = qn ? visible.filter((i) => norm(i.name).includes(qn)) : []
  const exact = qn ? visible.some((i) => norm(i.name) === qn) : false
  const pendingCount = d.suggestions.filter((s) => s.status === 'pending').length

  function target(y: number): { cat: string; index: number } | null {
    const secs = [...document.querySelectorAll<HTMLElement>('[data-cat]')]
    if (!secs.length) return null
    const sec = secs.find((el) => el.getBoundingClientRect().bottom >= y) ?? secs[secs.length - 1]
    const rows = [...sec.querySelectorAll<HTMLElement>('[data-rowid]')].filter(
      (r) => r.dataset.rowid !== dragId.current,
    )
    let index = 0
    for (const r of rows) {
      const b = r.getBoundingClientRect()
      if (b.top + b.height / 2 < y) index++
    }
    return { cat: sec.dataset.cat as string, index }
  }
  function refresh() {
    const t = target(yRef.current)
    dropRef.current = t
    setDrop(t)
  }
  // Scorrimento automatico vicino ai bordi mentre si trascina
  useEffect(() => {
    if (!drag) return
    const t = window.setInterval(() => {
      const y = yRef.current
      const h = window.innerHeight
      if (y < 110) window.scrollBy(0, -12)
      else if (y > h - 130) window.scrollBy(0, 12)
      else return
      refresh()
    }, 16)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null])

  function startDrag(e: React.PointerEvent, item: Item) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragId.current = item.id
    yRef.current = e.clientY
    setDrag({ id: item.id, label: item.name, x: e.clientX, y: e.clientY })
    refresh()
  }
  function moveDrag(e: React.PointerEvent) {
    if (!dragId.current) return
    yRef.current = e.clientY
    setDrag((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g))
    refresh()
  }
  function endDrag(cancel: boolean) {
    const id = dragId.current
    const t = dropRef.current
    dragId.current = null
    dropRef.current = null
    setDrag(null)
    setDrop(null)
    if (!id || !t || cancel) return
    const dest = (blocks.find(([c]) => c === t.cat)?.[1] ?? []).filter((i) => i.id !== id).map((i) => i.id)
    dest.splice(Math.min(t.index, dest.length), 0, id)
    const item = visible.find((i) => i.id === id)
    const cur = (blocks.find(([c]) => c === t.cat)?.[1] ?? []).map((i) => i.id)
    if (item && item.category === t.cat && cur.join() === dest.join()) return
    void d.moveItem(id, t.cat, dest)
  }

  return (
    <div className="screen">
      <header className="top">
        <div className="top-row">
          <h1>Elencone</h1>
          {d.isAdmin && (
            <span className="admin-modes">
              {mode === null || ordering ? (
                <button
                  type="button"
                  className={'btn ghost slim' + (ordering ? ' on' : '')}
                  onClick={() => setMode(ordering ? null : 'order')}
                  aria-pressed={ordering}
                >
                  {ordering ? 'Fine' : 'Riordina'}
                </button>
              ) : null}
              {mode === null || deleting ? (
                <button
                  type="button"
                  className={'btn ghost slim' + (deleting ? ' on' : '')}
                  onClick={() => setMode(deleting ? null : 'delete')}
                  aria-pressed={deleting}
                >
                  {deleting ? 'Fine' : 'Elimina'}
                </button>
              ) : null}
            </span>
          )}
          {(!d.online || d.pendingOps > 0) && (
            <span className="pill warn">
              {d.online
                ? `${d.pendingOps} da inviare`
                : `Offline${d.pendingOps ? ` · ${d.pendingOps} da inviare` : ''}`}
            </span>
          )}
        </div>
        <p className="tagline">
          Qui si selezionano i prodotti che mancano dalla lista globale di tutti i prodotti che comprate di solito.
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
        <button className="banner" onClick={() => goto('shop')}>
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
            blocks.map(([cat, items]) => (
              <div key={cat} className="cat" data-cat={cat}>
                <h2
                  className={
                    'sect-label' +
                    (ordering && drop?.cat === cat && items.filter((i) => i.id !== drag?.id).length === 0
                      ? ' dropto'
                      : '')
                  }
                >
                  <span>{cat}</span>
                </h2>
                <ul className="slist">
                  {items.map((item) => {
                    if (ordering) {
                      const others = items.filter((i) => i.id !== drag?.id)
                      const pos = others.findIndex((i) => i.id === item.id)
                      const isDrop = drag && drop?.cat === cat && item.id !== drag.id
                      const before = isDrop && pos === drop.index
                      const after = isDrop && pos === others.length - 1 && drop.index >= others.length
                      return (
                        <li
                          key={item.id}
                          data-rowid={item.id}
                          className={
                            'delrow orderrow' +
                            (drag?.id === item.id ? ' dragging' : '') +
                            (before ? ' drop-before' : '') +
                            (after ? ' drop-after' : '')
                          }
                        >
                          <span className="name">{item.name}</span>
                          <button
                            type="button"
                            className="icon-btn grip"
                            aria-label={`Sposta ${item.name}`}
                            onPointerDown={(e) => startDrag(e, item)}
                            onPointerMove={moveDrag}
                            onPointerUp={() => endDrag(false)}
                            onPointerCancel={() => endDrag(true)}
                          >
                            <IconGrip />
                          </button>
                        </li>
                      )
                    }
                    return deleting ? (
                      <li key={item.id} className="delrow">
                        <span className="name">{item.name}</span>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Elimina ${item.name}`}
                          onClick={async () => {
                            await d.archiveItem(item.id)
                            toast.show(`«${item.name}» eliminato`, {
                              label: 'Annulla',
                              run: () => void d.restoreItem(item.id),
                            })
                          }}
                        >
                          <IconTrash />
                        </button>
                      </li>
                    ) : (
                      <SlideRow key={item.id} item={item} goto={goto} hint={hintOn ? hintDelay(item.id) : undefined} />
                    )
                  })}
                </ul>
              </div>
            ))
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

      {drag && (
        <div className="dragghost" style={{ top: drag.y - 24 }}>
          {drag.label}
        </div>
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
