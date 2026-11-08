import { useState, type FormEvent } from 'react'
import { supabase } from './supabase'
import { useToast } from './toast'

const URL_APP = 'https://cosa-manca.it'
const MSG = 'Ti consiglio Cosa manca: la lista di ciò che manca in casa, condivisa con chi vive con te.'

/** Qualsiasi utente può far conoscere Cosa manca a qualcuno: via email o con la condivisione del telefono. */
export default function ShareCard() {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function sendMail(e: FormEvent) {
    e.preventDefault()
    const em = email.trim().toLowerCase()
    if (!em || busy) return
    setBusy(true)
    const { data: sess } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('send-referral', {
      body: { email: em },
      headers: sess.session ? { Authorization: `Bearer ${sess.session.access_token}` } : undefined,
    })
    setBusy(false)
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      let limited = false
      try {
        const ctx = (error as { context?: Response } | null)?.context
        limited = ctx?.status === 429
      } catch {
        /* ignora */
      }
      toast.show(
        limited
          ? 'Hai già invitato molte persone oggi. Riprova domani.'
          : 'Non sono riuscito a inviare. Controlla l’indirizzo.',
      )
      return
    }
    setEmail('')
    toast.show('Fatto! Gli ho mandato un’email.')
  }

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Cosa manca', text: MSG, url: URL_APP })
        return
      }
      await navigator.clipboard.writeText(`${MSG} ${URL_APP}`)
      toast.show('Link copiato: incollalo dove vuoi')
    } catch {
      /* condivisione annullata */
    }
  }

  return (
    <section className="card sharecard">
      <strong>Fai conoscere Cosa manca</strong>
      <p className="hint">Conosci qualcuno a cui servirebbe creare un suo gruppo? Mandagli il link, o scrivi qui la sua email.</p>
      <button type="button" className="btn primary wide" onClick={() => void share()}>
        Condividi
      </button>
      <form className="ideas-row" onSubmit={(e) => void sendMail(e)}>
        <input
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="email@esempio.it"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email della persona da invitare"
        />
        <button className="btn ghost" disabled={!email.trim() || busy}>
          Invia
        </button>
      </form>
    </section>
  )
}
