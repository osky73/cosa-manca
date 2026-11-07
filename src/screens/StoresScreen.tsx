import { lazy, Suspense, useState, type FormEvent } from 'react'
import { useData } from '../data'
import { StoreLogo } from '../components'
import { IconTrash } from '../icons'
import { STORE_CATALOG, STORE_COLORS, logoUrl, norm } from '../lib'
import { useToast } from '../toast'

const StoresMap = lazy(() => import('../StoresMap'))

export default function StoresScreen() {
  const d = useData()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(STORE_COLORS[0])

  const custom = d.stores.filter((s) => !logoUrl(s.logo))

  async function toggle(c: (typeof STORE_CATALOG)[number]) {
    if (busy) return
    const active = d.stores.find((s) => s.logo === c.logo)
    setBusy(c.logo)
    try {
      if (active) {
        await d.deleteStore(active.id)
        toast.show(`${c.name} disattivato`, { label: 'Annulla', run: () => void d.addStore(c.name, c.color, c.logo) })
      } else {
        await d.addStore(c.name, c.color, c.logo)
      }
    } finally {
      setBusy(null)
    }
  }

  async function addCustom(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n || d.stores.some((s) => norm(s.name) === norm(n))) return
    await d.addStore(n, color, null)
    setName('')
  }

  return (
    <div className="screen">
      <header className="top sticky">
        <div className="top-row">
          <h1>Negozi</h1>
          {(!d.online || d.pendingOps > 0) && (
            <span className="pill warn">{d.online ? 'Sincronizzo…' : 'Offline'}</span>
          )}
        </div>
      </header>

      <p className="hint pad">
        Attiva i supermercati dove fai la spesa abitualmente: potrai scegliere il negozio per ogni prodotto che manca.
      </p>

      <div className="shopgrid">
        {STORE_CATALOG.map((c) => {
          const active = d.stores.some((s) => s.logo === c.logo)
          return (
            <button
              key={c.logo}
              type="button"
              className={'shopcard' + (active ? ' on' : '')}
              onClick={() => void toggle(c)}
              disabled={busy === c.logo}
              role="switch"
              aria-checked={active}
              aria-label={c.name}
            >
              <img src={`/stores/${c.logo}.svg`} width="60" height="60" alt="" loading="lazy" draggable={false} />
              <span className="switch" aria-hidden="true">
                <i />
              </span>
            </button>
          )
        })}
      </div>

      <button className="btn ghost wide" onClick={() => setMapOpen(true)}>
        Mostra i negozi vicino a te sulla mappa
      </button>

      <section>
        <h2 className="section">Un altro negozio</h2>
        {custom.length > 0 && (
          <ul className="rows">
            {custom.map((s) => (
              <li key={s.id} className="static">
                <StoreLogo store={s} size={34} />
                <span className="grow">
                  <span className="name">{s.name}</span>
                </span>
                <button className="icon-btn" onClick={() => void d.deleteStore(s.id)} aria-label={`Elimina ${s.name}`}>
                  <IconTrash />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="card" onSubmit={(e) => void addCustom(e)}>
          <label className="field">
            <span>Non è nell'elenco? Aggiungilo</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="es. Mercato di quartiere"
            />
          </label>
          <div className="swatches" role="radiogroup" aria-label="Colore">
            {STORE_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                className={color === c ? 'on' : ''}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <button className="btn primary" disabled={!name.trim()}>
            Aggiungi negozio
          </button>
        </form>
      </section>
      {mapOpen && (
        <Suspense fallback={<div className="mapwrap mapload">Carico la mappa…</div>}>
          <StoresMap onClose={() => setMapOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}
