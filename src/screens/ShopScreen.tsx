import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../data'
import { Sheet } from '../components'
import { IconTrash } from '../icons'
import { useFade } from '../useFade'
import { SlideRow } from '../SlideRow'
import { byCategoryThenName } from '../lib'
import type { Item, Need, Tab } from '../types'

type Filter = 'all' | 'none' | string

type Row = { need: Need; item: Item }

export default function ShopScreen({ goto }: { goto: (t: Tab) => void }) {
  const d = useData()
  const [filter, setFilter] = useState<Filter>('all')

  // Tiene lo schermo acceso mentre si fa la spesa.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const request = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          lock = await navigator.wakeLock.request('screen')
          if (cancelled) void lock.release()
        }
      } catch {
        /* non supportato o negato: nessun problema */
      }
    }
    void request()
    const onVis = () => {
      if (document.visibilityState === 'visible') void request()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      void lock?.release()
    }
  }, [])

  const rows = useMemo(
    () =>
      d.needs
        .map((need) => ({ need, item: d.itemOf(need.item_id) }))
        .filter((x): x is { need: Need; item: Item } => Boolean(x.item))
        .sort((a, b) => byCategoryThenName(a.item, b.item)),
    [d.needs, d.itemOf],
  )

  const boughtRows = useMemo(() => {
    const open = new Set(rows.map((r) => r.item.id))
    const seen = new Set<string>()
    const out: Row[] = []
    for (const need of d.boughtNeeds) {
      const item = d.itemOf(need.item_id)
      if (!item || open.has(item.id) || seen.has(item.id)) continue
      seen.add(item.id)
      out.push({ need, item })
    }
    return out
  }, [rows, d.boughtNeeds, d.itemOf])

  const boughtAt = useRef(new Map<string, number>())
  const fadeOf = (r: Row): number | undefined => {
    if (r.need.status !== 'bought' || !boughtRows.includes(r)) return undefined
    const known = boughtAt.current.get(r.item.id)
    if (known) return known
    const t = r.need.bought_at ? Date.parse(r.need.bought_at) : Date.now()
    boughtAt.current.set(r.item.id, t)
    return t
  }
  useEffect(() => {
    const ids = new Set(boughtRows.map((r) => r.item.id))
    for (const id of [...boughtAt.current.keys()]) if (!ids.has(id)) boughtAt.current.delete(id)
  }, [boughtRows])

  const allBought = rows.length === 0 && boughtRows.length > 0
  const lastBought = allBought ? Math.max(...boughtRows.map((r) => fadeOf(r) ?? 0)) : undefined
  const fadeOff = useFade(lastBought, 0)

  const shown = useMemo(
    () => [...rows, ...boughtRows].sort((a, b) => byCategoryThenName(a.item, b.item)),
    [rows, boughtRows],
  )

  const sections = useMemo(() => {
    const out: { key: string; title: string; color?: string; rows: Row[] }[] = []
    const pushStore = (id: string) => {
      const s = d.storeOf(id)
      const r = shown.filter((x) => x.need.store_id === id)
      if (s && r.length) out.push({ key: id, title: s.name, color: s.color, rows: r })
    }
    const anywhere = shown.filter((x) => !x.need.store_id || !d.storeOf(x.need.store_id))
    if (filter === 'all') {
      d.stores.forEach((s) => pushStore(s.id))
      if (anywhere.length) out.push({ key: 'none', title: d.stores.length ? 'Ovunque' : 'Da comprare', rows: anywhere })
    } else if (filter === 'none') {
      if (anywhere.length) out.push({ key: 'none', title: 'Ovunque', rows: anywhere })
    } else {
      pushStore(filter)
      if (anywhere.length) out.push({ key: 'none', title: 'Va bene ovunque', rows: anywhere })
    }
    return out
  }, [shown, filter, d.stores, d.storeOf])

  // Negozi che hanno avuto prodotti: restano come pillole spente a 0 finché non si cancella la lista.
  const hasList = rows.length + boughtRows.length > 0
  const [asking, setAsking] = useState(false)
  const doClear = () => {
    d.clearAll()
    setSeen([])
    setAsking(false)
    try {
      localStorage.removeItem('cm.shopseen')
    } catch {
      /* ignora */
    }
  }
  const [seen, setSeen] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('cm.shopseen') || '[]') as string[]
    } catch {
      return []
    }
  })
  useEffect(() => {
    const now = d.stores.filter((s) => rows.some((x) => x.need.store_id === s.id)).map((s) => s.id)
    if (now.some((id) => !seen.includes(id))) {
      const next = [...new Set([...seen, ...now])]
      setSeen(next)
      try {
        localStorage.setItem('cm.shopseen', JSON.stringify(next))
      } catch {
        /* ignora */
      }
    }
  }, [rows, d.stores, seen])
  const countFor = (id: string) => rows.filter((x) => x.need.store_id === id).length
  useEffect(() => {
    if (filter !== 'all' && filter !== 'none' && countFor(filter) === 0) setFilter('all')
  })
  const countNone = rows.filter((x) => !x.need.store_id || !d.storeOf(x.need.store_id)).length

  return (
    <div className="screen shopscreen">
      <header className="top">
        <div className="top-row">
          <h1>Cosa manca</h1>
          {(!d.online || d.pendingOps > 0) && (
            <span className="pill warn">{d.online ? 'Sincronizzo…' : 'Offline'}</span>
          )}
        </div>
        <p className="tagline">
          Sai quando chiami a casa e chiedi «cosa manca?» e nessuno ha voglia di andare a vedere? Ecco fatto.
        </p>
      </header>
      <div className="top sticky bar">
        {hasList && d.stores.length > 0 && (
          <div
            className="filters"
            role="tablist"
            aria-label="Filtra per supermercato"
            style={{ ...fadeOff, pointerEvents: allBought ? 'none' : undefined }}
          >
            <span className="where">Dove?</span>
            <button
              role="tab"
              aria-selected={filter === 'none'}
              className={(filter === 'none' ? 'on' : '') + (countNone === 0 ? ' off' : '')}
              onClick={() => setFilter(filter === 'none' ? 'all' : 'none')}
            >
              ovunque <span className="count">{countNone}</span>
            </button>
            {d.stores
              .filter((s) => countFor(s.id) > 0 || seen.includes(s.id))
              .map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={filter === s.id}
                  className={(filter === s.id ? 'on' : '') + (countFor(s.id) === 0 ? ' off' : '')}
                  style={{ ['--c' as string]: s.color }}
                  onClick={() => setFilter(filter === s.id ? 'all' : s.id)}
                >
                  {s.name} <span className="count">{countFor(s.id)}</span>
                </button>
              ))}
          </div>
        )}
        {hasList && (
          <div className="cols" aria-hidden="true">
            <span>
              Comprati
              <span className="count">{boughtRows.length}</span>
            </span>
            <span>
              Mancano
              <span className="count">{rows.length}</span>
            </span>
          </div>
        )}
      </div>

      {sections.length === 0 ? (
        <p className="empty">{d.loaded ? 'Tutto a posto, per fortuna non manca niente.' : 'Carico la lista…'}</p>
      ) : (
        sections.map((sec) => (
          <section key={sec.key} className="shopsec">
            <ul className="slist">
              {sec.rows.map((r) => (
                <SlideRow key={r.item.id} item={r.item} goto={goto} pickStore={false} fadeFrom={fadeOf(r)} />
              ))}
            </ul>
          </section>
        ))
      )}

      {rows.length + boughtRows.length > 0 && (
        <div className="clear-wrap">
          <button
            className="clear-all"
            aria-label="Cancella tutto"
            title="Cancella tutto"
            onClick={() => setAsking(true)}
          >
            <IconTrash />
          </button>
        </div>
      )}

      {asking && (
        <Sheet title="Azzerare la lista?" onClose={() => setAsking(false)}>
          <p className="hint">Toglie tutti i prodotti che mancano e quelli già comprati.</p>
          <div className="stack">
            <button className="btn danger wide" onClick={doClear}>
              Sì, azzera
            </button>
            <button className="btn ghost wide" onClick={() => setAsking(false)}>
              Annulla
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
