import { lazy, Suspense, useState, type FormEvent } from 'react'
import { useData } from '../data'
import { Sheet } from '../components'
import { IconMapPin, IconNote, IconTrash } from '../icons'
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

  const custom = d.allStores.filter((s) => !logoUrl(s.logo))
  const [leaving, setLeaving] = useState<string | null>(null)
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const noteStore = d.allStores.find((s) => s.id === noteFor)

  function openNote(id: string) {
    setNoteText(d.allStores.find((s) => s.id === id)?.note ?? '')
    setNoteFor(id)
  }

  async function saveNote() {
    if (!noteFor) return
    await d.updateStore(noteFor, { note: noteText.trim() || null })
    setNoteFor(null)
  }

  async function removeCustom(s: (typeof custom)[number]) {
    await d.deleteStore(s.id)
    toast.show(`${s.name} eliminato`, { label: 'Annulla', run: () => void d.addStore(s.name, s.color, null, s.note) })
  }

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
          <button
            className="map-btn"
            onClick={() => setMapOpen(true)}
            aria-label="Mostra i negozi vicino a te sulla mappa"
            title="Mappa dei negozi vicini"
          >
            <IconMapPin />
          </button>
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
          const st = d.stores.find((x) => x.logo === c.logo)
          return (
            <div key={c.logo} className="shopcell">
              <button
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
            </div>
          )
        })}
        {custom.map((s) => {
          return (
            <div key={s.id} className="shopcell">
              <div
                className={'shopcard custom' + (leaving === s.id ? '' : ' on')}
                style={{ ['--c' as string]: s.color }}
              >
                <div className="cname">
                  <span>{s.name}</span>
                </div>
                <button
                  type="button"
                  className="switch"
                  onClick={() => {
                    if (leaving) return
                    setLeaving(s.id)
                    window.setTimeout(() => {
                      void removeCustom(s)
                      // se l'eliminazione non va a buon fine, il negozio torna acceso dopo qualche secondo
                      window.setTimeout(() => setLeaving(null), 4000)
                    }, 320)
                  }}
                  role="switch"
                  aria-checked={leaving !== s.id}
                  aria-label={`${s.name}: spegni per eliminare`}
                >
                  <i />
                  <IconTrash />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <section>
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
      {noteStore && (
        <Sheet title={`Dove si trova ${noteStore.name}`} onClose={() => setNoteFor(null)}>
          <label className="field">
            <span>Nota (indirizzo, zona, come arrivarci)</span>
            <textarea
              rows={3}
              maxLength={300}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="es. Via Roma 12, di fianco al bar"
            />
          </label>
          <button className="btn primary wide" onClick={() => void saveNote()}>
            Salva nota
          </button>
        </Sheet>
      )}
      {mapOpen && (
        <Suspense fallback={<div className="mapwrap mapload">Carico la mappa…</div>}>
          <StoresMap onClose={() => setMapOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}
