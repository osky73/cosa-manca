import { useState } from 'react'
import { useData } from './data'
import { StoreLogo } from './components'
import { useToast } from './toast'
import type { Recurrence } from './types'

/** Cerchio con l'iniziale di chi ha suggerito il prodotto; al tocco mostra il nome completo. */
export function WhoDot({ userId, className = '' }: { userId: string | null | undefined; className?: string }) {
  const d = useData()
  const toast = useToast()
  const name = d.whoOf(userId)
  if (!name) return null
  return (
    <button
      type="button"
      className={'whodot ' + className}
      onClick={(e) => {
        e.stopPropagation()
        toast.show(`Suggerito da ${name}`)
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      aria-label={`Suggerito da ${name}`}
    >
      {name.trim().charAt(0).toUpperCase()}
    </button>
  )
}

/** Area "Da approvare" dentro Cosa manca: l'admin accetta (fisso o temporaneo) o rifiuta. */
export default function Pending() {
  const d = useData()
  const [busy, setBusy] = useState<string | null>(null)
  const pending = d.suggestions.filter((s) => s.status === 'pending')
  if (pending.length === 0) return null

  async function decide(id: string, approve: boolean, rec?: Recurrence) {
    setBusy(id)
    await d.decide(id, approve, rec)
    setBusy(null)
  }

  return (
    <section className="pend" aria-label="Suggerimenti da approvare">
      <h2 className="section">
        Suggeriti {d.isAdmin ? 'da approvare' : 'in attesa'} <span className="count">{pending.length}</span>
      </h2>
      <ul className="pend-list">
        {pending.map((s) => {
          const st = d.storeOf(s.store_id)
          return (
            <li key={s.id} className="pend-item">
              <div className="pend-top">
                {s.kind === 'store' && <span className="dot big" style={{ ['--c' as string]: s.color ?? '#2f7d4f' }} />}
                {s.kind !== 'store' && s.recurrence === 'one_off' && <WhoDot userId={s.suggested_by} />}
                <span className="grow">
                  <span className="name">{s.name}</span>
                  <span className="meta">
                    {s.kind === 'store' ? 'Nuovo negozio' : s.recurrence === 'recurring' ? 'Fisso' : 'Temporaneo'} · da{' '}
                    {d.nameOf(s.suggested_by)}
                    {s.note ? ` · «${s.note}»` : ''}
                  </span>
                </span>
                {st && <StoreLogo store={st} size={27} />}
              </div>
              {d.isAdmin && s.kind === 'store' ? (
                <div className="pend-btns">
                  <button className="btn primary" disabled={busy === s.id} onClick={() => void decide(s.id, true)}>
                    Approva
                  </button>
                  <button className="btn ghost" disabled={busy === s.id} onClick={() => void decide(s.id, false)}>
                    Rifiuta
                  </button>
                </div>
              ) : d.isAdmin ? (
                <div className="pend-btns">
                  <button
                    className={'btn ' + (s.recurrence === 'recurring' ? 'primary' : 'ghost')}
                    disabled={busy === s.id}
                    onClick={() => void decide(s.id, true, 'recurring')}
                  >
                    Fisso
                  </button>
                  <button
                    className={'btn ' + (s.recurrence === 'one_off' ? 'primary' : 'ghost')}
                    disabled={busy === s.id}
                    onClick={() => void decide(s.id, true, 'one_off')}
                  >
                    Temporaneo
                  </button>
                  <button className="btn ghost" disabled={busy === s.id} onClick={() => void decide(s.id, false)}>
                    Rifiuta
                  </button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
