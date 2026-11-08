import { useState } from 'react'
import { supabase } from '../supabase'
import { useData } from '../data'
import { useToast } from '../toast'

export default function IdeasScreen() {
  const d = useData()
  const toast = useToast()
  const [idea, setIdea] = useState('')
  const [wish, setWish] = useState('')
  const [busy, setBusy] = useState<'idea' | 'wish' | null>(null)

  async function send(kind: 'idea' | 'wish') {
    const body = (kind === 'idea' ? idea : wish).trim()
    if (!body || busy) return
    setBusy(kind)
    const { error } = await supabase.from('feedback').insert({ group_id: d.groupId, kind, body })
    setBusy(null)
    if (error) {
      toast.show('Non sono riuscito a inviare. Riprova tra poco.')
      return
    }
    if (kind === 'idea') setIdea('')
    else setWish('')
    toast.show('Grazie! Ricevuto.')
  }

  return (
    <div className="screen">
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

      <p className="hint ideas-small">Cos'altro ti manca? Non possiamo fare tutto, ma leggere quello che ci scrivi.</p>
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
          placeholder="Cosa ti manca?"
          value={wish}
          onChange={(e) => setWish(e.target.value)}
          aria-label="Cos'altro ti manca"
        />
        <button className="btn primary" disabled={!wish.trim() || busy === 'wish'}>
          Invia
        </button>
      </form>
    </div>
  )
}
