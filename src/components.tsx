import { useEffect, useState, type ReactNode } from 'react'
import { IconX } from './icons'
import { useData, type ProposeInput } from './data'
import { useToast } from './toast'
import { NEW_PRODUCT_CATEGORIES, initials, logoUrl } from './lib'
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

/** Logo del supermercato, o la sigla colorata se è personalizzato. */
export function StoreLogo({ store, size = 36 }: { store: Store; size?: number }) {
  const url = logoUrl(store.logo)
  return url ? (
    <img className="slogo" src={url} width={size} height={size} alt="" loading="lazy" draggable={false} />
  ) : (
    <span className="slogo-ini" style={{ width: size, height: size, background: store.color, fontSize: size * 0.4 }}>
      {initials(store.name)}
    </span>
  )
}

export function StoreChip({ store, active, onClick }: { store: Store; active: boolean; onClick: () => void }) {
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
      <StoreLogo store={store} size={38} />
    </button>
  )
}

/** Scelta del supermercato per un prodotto che manca. */
export function StorePickerSheet({
  title,
  current,
  onPick,
  onClose,
  goStores,
}: {
  title: string
  current: string | null
  onPick: (id: string | null) => void
  onClose: () => void
  goStores: () => void
}) {
  const d = useData()
  return (
    <Sheet title={title} onClose={onClose}>
      {d.stores.length === 0 ? (
        <p className="hint">Non hai ancora attivato nessun supermercato.</p>
      ) : (
        <div className="picker">
          {d.stores.map((s) => (
            <button
              key={s.id}
              type="button"
              className={'pick' + (current === s.id ? ' on' : '')}
              onClick={() => onPick(s.id)}
              aria-pressed={current === s.id}
            >
              <StoreLogo store={s} size={44} />
              <span>{s.name}</span>
            </button>
          ))}
          <button type="button" className={'pick' + (current === null ? ' on' : '')} onClick={() => onPick(null)}>
            <span className="slogo-ini none">–</span>
            <span>Ovunque</span>
          </button>
        </div>
      )}
      <button
        type="button"
        className="link"
        onClick={() => {
          onClose()
          goStores()
        }}
      >
        Attiva altri supermercati
      </button>
    </Sheet>
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
  const [cat, setCat] = useState('')
  const [store, setStore] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [mark, setMark] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const label = d.isAdmin ? 'Aggiungi' : 'Invia per approvazione'
  const canSend = name.trim().length > 0 && rec !== null && cat !== '' && !busy

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
      toast.show(
        res === 'pending' ? 'Suggerimento inviato: lo approva un admin' : `«${input.name}» aggiunto alla lista`,
      )
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
            <b>Fisso</b>
            <small>Lo compriamo spesso: resta nel catalogo</small>
          </button>
          <button type="button" className={rec === 'one_off' ? 'on' : ''} onClick={() => setRec('one_off')}>
            <b>Temporaneo</b>
            <small>Serve solo stavolta: sparisce dopo l'acquisto</small>
          </button>
        </div>
      </div>

      <div className="field">
        <span>Categoria</span>
        <div className="catpick" role="radiogroup" aria-label="Categoria">
          {NEW_PRODUCT_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={cat === c}
              className={cat === c ? 'on' : ''}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {d.stores.length > 0 && (
        <div className="field">
          <span>Dove comprarlo (facoltativo)</span>
          <div className="chips">
            {d.stores.map((s) => (
              <StoreChip
                key={s.id}
                store={s}
                active={store === s.id}
                onClick={() => setStore(store === s.id ? null : s.id)}
              />
            ))}
          </div>
        </div>
      )}

      <label className="field">
        <span>Nota (facoltativa)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={120}
          placeholder="es. senza lattosio"
        />
      </label>

      {d.isAdmin && rec === 'recurring' && (
        <label className="check">
          <input type="checkbox" checked={mark} onChange={(e) => setMark(e.target.checked)} />
          <span>Segnalo subito come mancante</span>
        </label>
      )}
      {!d.isAdmin && (
        <p className="hint">
          Lo vede un amministratore, che decide se tenerlo fisso (nel catalogo) o temporaneo (solo nella spesa).
        </p>
      )}

      {err && <p className="error">{err}</p>}
      <button className="btn primary big" disabled={!canSend} onClick={() => void submit()}>
        {busy ? 'Un attimo…' : rec === null ? 'Scegli prima: fisso o temporaneo' : label}
      </button>
    </Sheet>
  )
}
