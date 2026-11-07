import { useMemo, useState } from 'react'
import { useData } from '../data'
import { ProposeSheet } from '../components'
import { SlideRow } from '../SlideRow'
import { IconPlus, IconSearch, IconX } from '../icons'
import { articleFor, byCategoryThenName, catRank, norm } from '../lib'
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
  const missingCount = d.needByItem.size

  const results = qn ? visible.filter((i) => norm(i.name).includes(qn)) : []
  const exact = qn ? visible.some((i) => norm(i.name) === qn) : false
  const pendingCount = d.suggestions.filter((s) => s.status === 'pending').length

  return (
    <div className="screen">
      <header className="top">
        <div className="top-row">
          <h1>Elencone</h1>
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
            blocks.map(([cat, items]) => (
              <div key={cat} className="cat">
                <h2 className="sect-label">
                  <span>{cat}</span>
                </h2>
                <ul className="slist">
                  {items.map((item) => (
                    <SlideRow key={item.id} item={item} goto={goto} />
                  ))}
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
