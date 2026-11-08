import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../data'
import { StoreLogo } from '../components'
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

  const countFor = (id: string) => rows.filter((x) => x.need.store_id === id).length
  useEffect(() => {
    if (filter !== 'all' && filter !== 'none' && countFor(filter) === 0) setFilter('all')
  })
  const countNone = rows.filter((x) => !x.need.store_id || !d.storeOf(x.need.store_id)).length

  return (
    <div className="screen">
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
        {d.stores.length > 0 && (
          <div className="filters" role="tablist" aria-label="Filtra per supermercato">
            <button
              role="tab"
              aria-selected={filter === 'none'}
              className={filter === 'none' ? 'on' : ''}
              onClick={() => setFilter(filter === 'none' ? 'all' : 'none')}
            >
              Ovunque <span className="count">{countNone}</span>
            </button>
            {d.stores
              .filter((s) => countFor(s.id) > 0)
              .map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={filter === s.id}
                  className={filter === s.id ? 'on' : ''}
                  style={{ ['--c' as string]: s.color }}
                  onClick={() => setFilter(filter === s.id ? 'all' : s.id)}
                >
                  <StoreLogo store={s} size={22} /> {s.name} <span className="count">{countFor(s.id)}</span>
                </button>
              ))}
          </div>
        )}
        <div className="cols" aria-hidden="true">
          <span>
            Comprati
            {boughtRows.length > 0 && <span className="count">{boughtRows.length}</span>}
          </span>
          <span>
            Mancano
            {rows.length > 0 && <span className="count">{rows.length}</span>}
          </span>
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="empty">{d.loaded ? 'Tutto a posto: non manca niente.' : 'Carico la lista…'}</p>
      ) : (
        sections.map((sec) => (
          <section key={sec.key} className="shopsec">
            <ul className="slist">
              {sec.rows.map(({ item }) => (
                <SlideRow key={item.id} item={item} goto={goto} />
              ))}
            </ul>
          </section>
        ))
      )}

      {boughtRows.length > 0 && (
        <button
          className="btn ghost wide clear-all"
          onClick={() => {
            if (confirm(`Togliere dalla lista i ${boughtRows.length} prodotti comprati?`)) void d.clearBought()
          }}
        >
          Cancella tutto
        </button>
      )}
    </div>
  )
}
