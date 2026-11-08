import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useData } from '../data'
import { useToast } from '../toast'

interface Received {
  id: string
  kind: 'idea' | 'wish'
  body: string
  created_at: string
  display_name: string | null
  email: string | null
  group_name: string | null
}

export default function IdeasScreen() {
  const d = useData()
  const toast = useToast()
  const [idea, setIdea] = useState('')
  const [wish, setWish] = useState('')
  const [received, setReceived] = useState<Received[] | null>(null)
  const [busy, setBusy] = useState<'idea' | 'wish' | null>(null)

  // Solo il super admin riceve la lista dei messaggi degli altri (la funzione risponde con errore a tutti gli altri).
  useEffect(() => {
    void (async () => {
      const { data: ok } = await supabase.rpc('is_super_admin')
      if (ok !== true) return
      const { data } = await supabase.rpc('list_feedback')
      setReceived((data as Received[]) ?? [])
    })()
  }, [])

  async function send(kind: 'idea' | 'wish') {
    const body = (kind === 'idea' ? idea : wish).trim()
    if (!body || busy) return
    setBusy(kind)
    const { data, error } = await supabase
      .from('feedback')
      .insert({ group_id: d.groupId, kind, body })
      .select('id')
      .single()
    setBusy(null)
    if (error) {
      toast.show('Non sono riuscito a inviare. Riprova tra poco.')
      return
    }
    // l'avviso via email è un di più: se fallisce, il messaggio è comunque salvato
    void supabase.functions.invoke('send-feedback', { body: { id: data.id } }).catch(() => {})
    if (kind === 'idea') setIdea('')
    else setWish('')
    toast.show('Grazie! Ricevuto.')
  }

  return (
    <div className="screen ideasscreen">
      <header className="top sticky">
        <div className="top-row">
          <h1>Cosa manca a Cosa manca</h1>
        </div>
      </header>

      <p className="tagline">
        Indicaci le migliorie o le funzionalità che vorresti implementassimo nell'app; ci sarà molto utile e te ne
        saremo eternamente grati.
      </p>

      <form
        className="card ideas-form"
        onSubmit={(e) => {
          e.preventDefault()
          void send('idea')
        }}
      >
        <textarea
          rows={5}
          maxLength={2000}
          placeholder="Scrivi qui la tua idea…"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          aria-label="La tua idea"
        />
        <button className="btn primary wide" disabled={!idea.trim() || busy === 'idea'}>
          Invia
        </button>
      </form>

      {received && (
        <section className="received">
          <h2 className="section">
            Messaggi ricevuti <span className="count">{received.length}</span>
          </h2>
          {received.length === 0 ? (
            <p className="hint">Ancora nessun messaggio dagli altri.</p>
          ) : (
            <ul className="rec-list">
              {received.map((m) => (
                <li key={m.id} className="rec-item">
                  <div className="rec-head">
                    <strong>{m.display_name?.trim() || 'Senza nome'}</strong>
                    <span className="pill">{m.kind === 'idea' ? 'Idea' : 'Cosa manca'}</span>
                  </div>
                  <div className="rec-meta">
                    {m.email && <a href={`mailto:${m.email}`}>{m.email}</a>} ·{' '}
                    {new Date(m.created_at).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })}
                    {m.group_name ? ` · ${m.group_name}` : ''}
                  </div>
                  <p className="rec-body">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="ideas-bottom">
        <p className="hint ideas-small">
          Cos'altro ti manca?
          <br />
          Tutti abbiamo qualcosa che ci manca in fondo...
        </p>
        <form
          className="ideas-row"
          onSubmit={(e) => {
            e.preventDefault()
            void send('wish')
          }}
        >
          <input
            type="text"
            maxLength={300}
            placeholder="Es. una persona cara, il cane di quando ero bambino, l'estate..."
            value={wish}
            onChange={(e) => setWish(e.target.value)}
            aria-label="Cos'altro ti manca"
          />
          <button className="btn primary" disabled={!wish.trim() || busy === 'wish'}>
            Invia
          </button>
        </form>
      </div>
    </div>
  )
}
