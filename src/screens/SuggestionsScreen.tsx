import { useState } from 'react'
import { useData } from '../data'
import type { Recurrence, Suggestion } from '../types'

function recLabel(s: Suggestion) {
  return s.recurrence === 'recurring' ? 'Fisso' : 'Temporaneo'
}

export default function SuggestionsScreen() {
  const d = useData()
  const [busy, setBusy] = useState<string | null>(null)
  const pending = d.suggestions.filter((s) => s.status === 'pending')
  const decided = d.suggestions.filter((s) => s.status !== 'pending').slice(0, 15)

  async function decide(id: string, approve: boolean, recurrence?: Recurrence) {
    setBusy(id)
    await d.decide(id, approve, recurrence)
    setBusy(null)
  }

  return (
    <div className="screen">
      <header className="top sticky">
        <div className="top-row">
          <h1>Suggerimenti</h1>
        </div>
      </header>

      {pending.length === 0 ? (
        <p className="empty">Nessun suggerimento in attesa. Per proporre un nuovo prodotto, cercalo nella scheda Lista.</p>
      ) : (
        <ul className="cards">
          {pending.map((s) => (
            <li key={s.id} className="card">
              <div className="grow">
                <span className="name">{s.name}</span>
                <span className="meta">
                  {recLabel(s)} · {s.category} · da {d.nameOf(s.suggested_by)}
                  {s.store_id && d.storeOf(s.store_id) ? ` · ${d.storeOf(s.store_id)?.name}` : ''}
                </span>
                {s.note && <span className="meta">«{s.note}»</span>}
              </div>
              {d.isAdmin ? (
                <div className="decide">
                  <button
                    className={'btn wide ' + (s.recurrence === 'recurring' ? 'primary' : 'ghost')}
                    disabled={busy === s.id}
                    onClick={() => void decide(s.id, true, 'recurring')}
                  >
                    Accetta come fisso{s.recurrence === 'recurring' ? ' (richiesto)' : ''}
                  </button>
                  <button
                    className={'btn wide ' + (s.recurrence === 'one_off' ? 'primary' : 'ghost')}
                    disabled={busy === s.id}
                    onClick={() => void decide(s.id, true, 'one_off')}
                  >
                    Accetta come temporaneo{s.recurrence === 'one_off' ? ' (richiesto)' : ''}
                  </button>
                  <button className="btn ghost wide" disabled={busy === s.id} onClick={() => void decide(s.id, false)}>
                    Rifiuta
                  </button>
                </div>
              ) : (
                <span className="pill">In attesa</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {decided.length > 0 && (
        <section>
          <h2 className="section">Storico recente</h2>
          <ul className="rows">
            {decided.map((s) => (
              <li key={s.id} className="static">
                <span className="grow">
                  <span className="name">{s.name}</span>
                  <span className="meta">
                    {recLabel(s)} · da {d.nameOf(s.suggested_by)}
                  </span>
                </span>
                <span className={'pill ' + (s.status === 'approved' ? 'ok' : 'no')}>
                  {s.status === 'approved' ? 'Approvato' : 'Rifiutato'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
