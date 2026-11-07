import { useMemo, useState } from 'react'
import { useData } from '../data'
import { ProposeSheet, StoreChip } from '../components'
import { InstallCard, useInstall } from '../install'
import { IconChevron, IconPlus, IconSearch, IconX } from '../icons'
import { byCategoryThenName, catRank, norm } from '../lib'
import type { Item, Need, Tab } from '../types'

export default function ListScreen({ goto }: { goto: (t: Tab) => void }) {
  const d = useData()
  const install = useInstall()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [proposeName, setProposeName] = useState<string | null>(null)
  const [hideInstall, setHideInstall] = useState(() => localStorage.getItem('cm.install.hide') === '1')

  const qn = norm(q)
  const visible = useMemo(() => d.items.filter((i) => !i.hidden), [d.items])

  const missing = useMemo(
    () =>
      d.needs
        .map((n) => ({ need: n, item: d.itemOf(n.item_id) }))
        .filter((x): x is { need: Need; item: Item } => Boolean(x.item))
        .sort((a, b) => byCategoryThenName(a.item, b.item)),
    [d.needs, d.itemOf],
  )

  const groups = useMemo(() => {
    const m = new Map<string, Item[]>()
    for (const i of visible) {
      if (d.needByItem.has(i.id)) continue
      m.set(i.category, [...(m.get(i.category) ?? []), i])
    }
    return [...m.entries()].sort((a, b) => catRank(a[0]) - catRank(b[0]) || a[0].localeCompare(b[0], 'it'))
  }, [visible, d.needByItem])

  const results = qn ? visible.filter((i) => norm(i.name).includes(qn)) : []
  const exact = qn ? visible.some((i) => norm(i.name) === qn) : false
  const pendingCount = d.suggestions.filter((s) => s.status === 'pending').length

  function toggleCat(c: string) {
    const n = new Set(open)
    if (n.has(c)) n.delete(c)
    else n.add(c)
    setOpen(n)
  }

  return (
    <div className="screen">
      <header className="top sticky">
        <div className="top-row">
          <h1>Cosa manca</h1>
          {(!d.online || d.pendingOps > 0) && (
            <span className="pill warn">{d.online ? `${d.pendingOps} da inviare` : `Offline${d.pendingOps ? ` · ${d.pendingOps} da inviare` : ''}`}</span>
          )}
        </div>
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
      </header>

      {!install.standalone && !hideInstall && !q && (
        <InstallCard
          onDismiss={() => {
            localStorage.setItem('cm.install.hide', '1')
            setHideInstall(true)
          }}
        />
      )}

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
                    <span className="name">{d.isAdmin ? 'Aggiungi' : 'Suggerisci'} «{q.trim()}»</span>
                    <span className="meta">Non è nel catalogo</span>
                  </span>
                </button>
              </li>
            )}
          </ul>
        </section>
      ) : (
        <>
          <section>
            <h2 className="section">
              Mancano <span className="count">{missing.length}</span>
            </h2>
            {missing.length === 0 ? (
              <p className="empty">
                {d.loaded
                  ? 'Per ora non manca niente. Tocca un prodotto qui sotto o cercalo in alto quando finisce.'
                  : 'Carico la lista…'}
              </p>
            ) : (
              <ul className="rows">
                {missing.map(({ need, item }) => (
                  <NeedRow key={need.id} need={need} item={item} />
                ))}
              </ul>
            )}
            {d.stores.length === 0 && missing.length > 0 && d.isAdmin && (
              <p className="hint pad">Aggiungi i supermercati nella scheda Gruppo per indicare dove comprare ogni cosa.</p>
            )}
          </section>

          <section>
            <h2 className="section">Prodotti</h2>
            {groups.map(([cat, items]) => (
              <div key={cat} className="cat">
                <button className="cat-head" onClick={() => toggleCat(cat)} aria-expanded={open.has(cat)}>
                  <IconChevron open={open.has(cat)} />
                  <span className="grow">{cat}</span>
                  <span className="count">{items.length}</span>
                </button>
                {open.has(cat) && (
                  <ul className="rows">
                    {items.map((item) => (
                      <li key={item.id}>
                        <button className="row-main" onClick={() => d.toggleMissing(item)}>
                          <span className="mark">
                            <IconPlus />
                          </span>
                          <span className="grow">
                            <span className="name">{item.name}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            <button className="btn ghost wide" onClick={() => setProposeName('')}>
              {d.isAdmin ? '+ Nuovo prodotto' : '+ Suggerisci un prodotto'}
            </button>
          </section>
        </>
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

function NeedRow({ need, item }: { need: Need; item: Item }) {
  const d = useData()
  const store = d.storeOf(need.store_id)
  return (
    <li className="need">
      <button className="row-main" onClick={() => d.toggleMissing(item)} aria-label={`${item.name}: tocca per togliere dalla lista`}>
        <span className="mark on">✓</span>
        <span className="grow">
          <span className="name">{item.name}</span>
          <span className="meta">
            {[
              store ? `da ${store.name}` : null,
              need.requested_by && need.requested_by !== d.userId ? `chiesto da ${d.nameOf(need.requested_by)}` : null,
              need.note,
            ]
              .filter(Boolean)
              .join(' · ') || 'Tocca per togliere'}
          </span>
        </span>
      </button>
      {d.stores.length > 0 && (
        <div className="chips" role="group" aria-label={`Dove comprare ${item.name}`}>
          {d.stores.map((s) => (
            <StoreChip
              key={s.id}
              store={s}
              active={need.store_id === s.id}
              onClick={() => d.setNeedStore(need.id, need.store_id === s.id ? null : s.id)}
            />
          ))}
        </div>
      )}
    </li>
  )
}
