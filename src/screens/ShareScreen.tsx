import { useEffect, useMemo, useState } from 'react'
import { useData } from '../data'
import { ProposeSheet } from '../components'
import { useToast } from '../toast'
import { classifica, leggiContenuto, takeShared } from '../share'
import type { Item } from '../types'

interface Row {
  line: string
  item: Item
  checked: boolean
}

/** Schermata unica di conferma: si apre solo dopo una condivisione dal menu di Android. */
export default function ShareScreen({ onDone }: { onDone: () => void }) {
  const d = useData()
  const toast = useToast()
  const [status, setStatus] = useState('Leggo il contenuto…')
  const [ready, setReady] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [unknown, setUnknown] = useState<string[]>([])
  const [dropped, setDropped] = useState(0)
  const [proposing, setProposing] = useState<string | null>(null)
  const visible = useMemo(() => d.items.filter((i) => !i.hidden), [d.items])

  useEffect(() => {
    if (!d.loaded || ready) return
    let alive = true
    void (async () => {
      const shared = await takeShared()
      if (!alive) return
      if (!shared) {
        toast.show('Non c’è niente da leggere')
        onDone()
        return
      }
      const lines = await leggiContenuto(shared, (t) => alive && setStatus(t))
      if (!alive) return
      const { matched, dropped: n } = classifica(lines, visible)
      setRows(
        matched
          .filter((m) => m.item)
          .map((m) => ({ line: m.line, item: m.item as Item, checked: !d.needByItem.has((m.item as Item).id) })),
      )
      setUnknown(matched.filter((m) => !m.item).map((m) => m.line))
      setDropped(n)
      setReady(true)
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.loaded])

  const toAdd = rows.filter((r) => r.checked && !d.needByItem.has(r.item.id))

  function confirm() {
    for (const r of toAdd) d.addMissing(r.item)
    toast.show(toAdd.length ? `Segnati come mancanti: ${toAdd.length}` : 'Nessun prodotto aggiunto')
    onDone()
  }

  if (!ready)
    return (
      <div className="screen">
        <p className="empty">{status}</p>
      </div>
    )

  return (
    <div className="screen">
      <header className="top">
        <h1>Condiviso con Cosa manca</h1>
        <p className="tagline">Controlla cosa ho capito, poi conferma.</p>
      </header>

      {rows.length === 0 && unknown.length === 0 && (
        <p className="empty">Non ho trovato prodotti nel contenuto condiviso.</p>
      )}

      {rows.length > 0 && (
        <section>
          <h2 className="sect-label">
            <span>Riconosciuti</span>
          </h2>
          <ul className="rows">
            {rows.map((r, i) => {
              const already = d.needByItem.has(r.item.id)
              return (
                <li key={r.item.id}>
                  <label className="row-main share-row">
                    <input
                      type="checkbox"
                      checked={r.checked && !already}
                      disabled={already}
                      onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)))}
                    />
                    <span className="grow">
                      <span className="name">{r.item.name}</span>
                      <span className="meta">
                        {already
                          ? 'Già in lista'
                          : r.line !== r.item.name.toLowerCase()
                            ? `Letto: «${r.line}»`
                            : r.item.category}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {unknown.length > 0 && (
        <section>
          <h2 className="sect-label">
            <span>Non riconosciuti</span>
          </h2>
          <ul className="rows">
            {unknown.map((u) => (
              <li key={u} className="row-main share-unknown">
                <span className="grow">
                  <span className="name">{u}</span>
                </span>
                <button className="btn slim" onClick={() => setProposing(u)}>
                  {d.isAdmin ? "Aggiungi all'elencone" : 'Suggerisci'}
                </button>
                <button className="btn ghost slim" onClick={() => setUnknown(unknown.filter((x) => x !== u))}>
                  Scarta
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dropped > 0 && (
        <p className="hint pad">
          {dropped === 1 ? 'Ho scartato 1 frase' : `Ho scartato ${dropped} frasi`} che non sembravano prodotti.
        </p>
      )}

      <div className="share-actions">
        <button className="btn wide" onClick={confirm}>
          {toAdd.length ? `Segna ${toAdd.length} come mancanti` : 'Fine'}
        </button>
        <button className="btn ghost wide" onClick={onDone}>
          Annulla
        </button>
      </div>

      {proposing !== null && (
        <ProposeSheet
          initialName={proposing.charAt(0).toUpperCase() + proposing.slice(1)}
          onClose={() => setProposing(null)}
          onDone={() => {
            setUnknown(unknown.filter((x) => x !== proposing))
            setProposing(null)
          }}
        />
      )}
    </div>
  )
}
