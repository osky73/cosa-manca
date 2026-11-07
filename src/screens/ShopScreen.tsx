import { useEffect, useMemo, useState } from 'react'
import { useData } from '../data'
import { StoreLogo } from '../components'
import { byCategoryThenName } from '../lib'
import type { Item, Need } from '../types'

type Filter = 'all' | 'none' | string

export default function ShopScreen() {
  const d = useData()
  const [filter, setFilter] = useState<Filter>('all')
  const [leaving, setLeaving] = useState<Set<string>>(new Set())

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

  const sections = useMemo(() => {
    const out: { key: string; title: string; color?: string; rows: typeof rows }[] = []
    const pushStore = (id: string) => {
      const s = d.storeOf(id)
      const r = rows.filter((x) => x.need.store_id === id)
      if (s && r.length) out.push({ key: id, title: s.name, color: s.color, rows: r })
    }
    const anywhere = rows.filter((x) => !x.need.store_id || !d.storeOf(x.need.store_id))
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
  }, [rows, filter, d.stores, d.storeOf])

  const countFor = (id: string) => rows.filter((x) => x.need.store_id === id).length
  const countNone = rows.filter((x) => !x.need.store_id || !d.storeOf(x.need.store_id)).length

  function buy(need: Need) {
    setLeaving((s) => new Set(s).add(need.id))
    window.setTimeout(() => {
      d.markBought(need)
      setLeaving((s) => {
        const n = new Set(s)
        n.delete(need.id)
        return n
      })
    }, 220)
  }

  return (
    <div className="screen">
      <header className="top sticky">
        <div className="top-row">
          <h1>Spesa</h1>
          {(!d.online || d.pendingOps > 0) && <span className="pill warn">{d.online ? 'Sincronizzo…' : 'Offline'}</span>}
        </div>
        {d.stores.length > 0 && (
          <div className="filters" role="tablist" aria-label="Filtra per supermercato">
            <button role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
              Tutto <span className="count">{rows.length}</span>
            </button>
            {d.stores.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={filter === s.id}
                className={filter === s.id ? 'on' : ''}
                style={{ ['--c' as string]: s.color }}
                onClick={() => setFilter(s.id)}
              >
                <StoreLogo store={s} size={22} /> {s.name} <span className="count">{countFor(s.id)}</span>
              </button>
            ))}
            <button role="tab" aria-selected={filter === 'none'} className={filter === 'none' ? 'on' : ''} onClick={() => setFilter('none')}>
              Ovunque <span className="count">{countNone}</span>
            </button>
          </div>
        )}
      </header>

      {sections.length === 0 ? (
        <p className="empty">{d.loaded ? 'Tutto a posto: non manca niente.' : 'Carico la lista…'}</p>
      ) : (
        sections.map((sec) => (
          <section key={sec.key}>
            {(sections.length > 1 || d.stores.length > 0) && (
              <h2 className="section" style={sec.color ? { ['--c' as string]: sec.color } : undefined}>
                {sec.color && <i className="dot" />} {sec.title} <span className="count">{sec.rows.length}</span>
              </h2>
            )}
            <ul className="rows">
              {sec.rows.map(({ need, item }) => (
                <li key={need.id} className={leaving.has(need.id) ? 'leaving' : ''}>
                  <button className="row-main" onClick={() => buy(need)} aria-label={`Segna come preso: ${item.name}`}>
                    <span className="box" />
                    <span className="grow">
                      <span className="name">{item.name}</span>
                      <span className="meta">{[item.category, need.note].filter(Boolean).join(' · ')}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
