import { useEffect, useState, type ReactNode } from 'react'
import { IconX } from './icons'
import { useData, type ProposeInput } from './data'
import { useToast } from './toast'
import { categoriesOf, initials } from './lib'
import type { Recurrence, Store } from './types'

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', k)
    document.body.classList.add('noscroll')
    return () => {
      window.removeEventListener('keydown', k)
      document.body.classList.remove('noscroll')
    }
  }, [onClose])

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="grab" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Chiudi">
            <IconX />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function StoreChip({
  store,
  active,
  onClick,
}: {
  store: Store
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={'chip' + (active ? ' on' : '')}
      style={{ ['--c' as string]: store.color }}
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${store.name}${active ? ' (scelto)' : ''}`}
      title={store.name}
    >
      {initials(store.name)}
    </button>
  )
}

export function ProposeSheet({
  initialName,
  onClose,
  onDone,
}: {
  initialName: string
  onClose: () => void
  onDone: () => void
}) {
  const d = useData()
  const toast = useToast()
  const [name, setName] = useState(initialName)
  const [rec, setRec] = useState<Recurrence | null>(null)
  const [cat, setCat] = useState('Altro')
  const [store, setStore] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [mark, setMark] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const label = d.isAdmin ? 'Aggiungi' : rec === 'one_off' ? 'Aggiungi alla lista' : 'Invia per approvazione'
  const canSend = name.trim().length > 0 && rec !== null && !busy

  async function submit() {
    if (!rec) return
    setBusy(true)
    setErr('')
    try {
      const input: ProposeInput = {
        name: name.trim(),
        category: cat,
        recurrence: rec,
        note: note.trim(),
        storeId: store,
        markMissing: mark,
      }
      const res = await d.propose(input)
      toast.show(res === 'pending' ? 'Suggerimento inviato: lo approva un admin' : `«${input.name}» aggiunto alla lista`)
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Qualcosa è andato storto')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title={d.isAdmin ? 'Nuovo prodotto' : 'Suggerisci un prodotto'} onClose={onClose}>
      <label className="field">
        <span>Nome</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoCapitalize="sentences" />
      </label>

      <div className="field">
        <span>Quanto serve?</span>
        <div className="seg two">
          <button type="button" className={rec === 'recurring' ? 'on' : ''} onClick={() => setRec('recurring')}>
            <b>Ricorrente</b>
            <small>Lo compriamo spesso: resta nel catalogo</small>
          </button>
          <button type="button" className={rec === 'one_off' ? 'on' : ''} onClick={() => setRec('one_off')}>
            <b>Una tantum</b>
            <small>Serve solo stavolta: sparisce dopo l'acquisto</small>
          </button>
        </div>
      </div>

      <label className="field">
        <span>Categoria</span>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          {categoriesOf(d.items).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>

      {d.stores.length > 0 && (
        <div className="field">
          <span>Dove comprarlo (facoltativo)</span>
          <div className="chips">
            {d.stores.map((s) => (
              <StoreChip key={s.id} store={s} active={store === s.id} onClick={() => setStore(store === s.id ? null : s.id)} />
            ))}
          </div>
        </div>
      )}

      <label className="field">
        <span>Nota (facoltativa)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="es. senza lattosio" />
      </label>

      {d.isAdmin && rec === 'recurring' && (
        <label className="check">
          <input type="checkbox" checked={mark} onChange={(e) => setMark(e.target.checked)} />
          <span>Segnalo subito come mancante</span>
        </label>
      )}
      {!d.isAdmin && rec === 'recurring' && (
        <p className="hint">Un amministratore deve approvarlo prima che entri nel catalogo.</p>
      )}
      {!d.isAdmin && rec === 'one_off' && <p className="hint">Compare subito in lista, senza approvazione.</p>}

      {err && <p className="error">{err}</p>}
      <button className="btn primary big" disabled={!canSend} onClick={() => void submit()}>
        {busy ? 'Un attimo…' : rec === null ? 'Scegli prima: ricorrente o una tantum' : label}
      </button>
    </Sheet>
  )
}
