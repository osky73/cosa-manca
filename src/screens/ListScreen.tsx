import { useMemo, useState } from 'react'
import { useData } from '../data'
import { ProposeSheet, StoreChip } from '../components'
import { InstallCard, useInstall } from '../install'
import { IconPlus, IconSearch, IconX } from '../icons'
import { byCategoryThenName, norm, storeInitials } from '../lib'
import type { Item, Tab } from '../types'

export default function ListScreen({ goto }: { goto: (t: Tab) => void }) {
  const d = useData()
  const install = useInstall()
  const [q, setQ] = useState('')
  const [proposeName, setProposeName] = useState<string | null>(null)
  const [hideInstall, setHideInstall] = useState(() => localStorage.getItem('cm.install.hide') === '1')

  const qn = norm(q)
  const visible = useMemo(() => d.items.filter((i) => !i.hidden), [d.items])

  // Un'unica lista, sempre nello stesso ordine: spostare un prodotto non cambia la sua posizione.
  const sorted = useMemo(() => [...visible].sort(byCategoryThenName), [visible])
  const missingCount = d.needByItem.size

  const results = qn ? visible.filter((i) => norm(i.name).includes(qn)) : []
  const exact = qn ? visible.some((i) => norm(i.name) === qn) : false
  const pendingCount = d.suggestions.filter((s) => s.status === 'pending').length

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
        {!qn && (
          <div className="cols" aria-hidden="true">
            <span>Tutti</span>
            <span>
              Mancano{missingCount > 0 && <span className="count">{missingCount}</span>}
            </span>
          </div>
        )}
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
        <section>
          {sorted.length === 0 ? (
            <p className="empty">{d.loaded ? 'Il catalogo è vuoto. Aggiungi il primo prodotto.' : 'Carico la lista…'}</p>
          ) : (
            <ul className="slist">
              {sorted.map((item) => (
                <SlideRow key={item.id} item={item} />
              ))}
            </ul>
          )}
          {d.stores.length === 0 && missingCount > 0 && d.isAdmin && (
            <p className="hint pad">Aggiungi i supermercati nella scheda Gruppo per indicare dove comprare ogni cosa.</p>
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

function SlideRow({ item }: { item: Item }) {
  const d = useData()
  const need = d.needByItem.get(item.id)
  const store = need ? d.storeOf(need.store_id) : undefined

  // Tocca il badge: passa al supermercato successivo (e poi a nessuno).
  function cycleStore() {
    if (!need || d.stores.length === 0) return
    const i = d.stores.findIndex((x) => x.id === need.store_id)
    const next = i + 1 < d.stores.length ? d.stores[i + 1].id : null
    d.setNeedStore(need.id, next)
  }

  return (
    <li className="slrow">
      {need && d.stores.length > 0 && (
        <button
          type="button"
          className={'slstore' + (store ? ' set' : '')}
          style={store ? { ['--c' as string]: store.color } : undefined}
          onClick={cycleStore}
          aria-label={store ? `Dove comprare ${item.name}: ${store.name}. Tocca per cambiare` : `Scegli dove comprare ${item.name}`}
        >
          {store ? storeInitials(store.name) : '+'}
        </button>
      )}
      <button
        type="button"
        className={'slider' + (need ? ' on' : '')}
        onClick={() => (need ? d.markBought(need) : d.toggleMissing(item))}
        aria-pressed={Boolean(need)}
        aria-label={need ? `${item.name}: manca. Tocca per segnare come preso` : `${item.name}: tocca se manca`}
      >
        <span className="slname">{item.name}</span>
      </button>
    </li>
  )
}
