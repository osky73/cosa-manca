import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../supabase'

function explain(message: string): string {
  if (/rate limit|security purposes|too many/i.test(message)) return 'Troppi tentativi: riprova tra qualche minuto.'
  if (/not authorized|not allowed|signups? not allowed/i.test(message)) return 'Questa email non è autorizzata.'
  return "Non sono riuscito a inviare il codice. Controlla l'email e riprova."
}

export default function Login() {
  const [email, setEmail] = useState(() => localStorage.getItem('cm.email') ?? '')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [cool, setCool] = useState(0)

  useEffect(() => {
    if (cool <= 0) return
    const t = window.setTimeout(() => setCool(cool - 1), 1000)
    return () => window.clearTimeout(t)
  }, [cool])

  async function send(e?: FormEvent) {
    e?.preventDefault()
    const em = email.trim().toLowerCase()
    if (!em) return
    setBusy(true)
    setErr('')
    const { error } = await supabase.auth.signInWithOtp({ email: em, options: { shouldCreateUser: true } })
    setBusy(false)
    if (error) {
      setErr(explain(error.message))
      return
    }
    localStorage.setItem('cm.email', em)
    setEmail(em)
    setStep('code')
    setCode('')
    setCool(30)
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.replace(/\s/g, ''),
      type: 'email',
    })
    setBusy(false)
    if (error) setErr("Codice non valido o scaduto. Controlla l'email o richiedine uno nuovo.")
  }

  return (
    <main className="auth">
      <div className="brand">
        <img src="/pwa-192.png" width="72" height="72" alt="" />
        <h1>Cosa manca</h1>
        <p>Sai quando chiami a casa e chiedi «cosa manca?» e nessuno ha voglia di andare a vedere? Ecco fatto.</p>
      </div>

      {step === 'email' ? (
        <form onSubmit={(e) => void send(e)} className="card">
          <label className="field">
            <span>La tua email</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@esempio.it"
            />
          </label>
          {err && <p className="error">{err}</p>}
          <button className="btn primary big" disabled={busy || !email.trim()}>
            {busy ? 'Invio…' : 'Ricevi il codice'}
          </button>
          <p className="hint">Niente password: ti mandiamo un codice via email.</p>
        </form>
      ) : (
        <form onSubmit={(e) => void verify(e)} className="card">
          <p>
            Ti abbiamo scritto a <b>{email}</b>. Inserisci il codice che trovi nell'email.
          </p>
          <label className="field">
            <span>Codice</span>
            <input
              className="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={12}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
            />
          </label>
          {err && <p className="error">{err}</p>}
          <button className="btn primary big" disabled={busy || code.replace(/\s/g, '').length < 6}>
            {busy ? 'Verifica…' : 'Entra'}
          </button>
          <div className="row-actions">
            <button type="button" className="link" onClick={() => setStep('email')}>
              Cambia email
            </button>
            <button type="button" className="link" disabled={cool > 0 || busy} onClick={() => void send()}>
              {cool > 0 ? `Rinvia tra ${cool}s` : 'Rinvia il codice'}
            </button>
          </div>
        </form>
      )}

      <footer className="auth-foot">
        Cosa manca è un’applicazione sviluppata senza scopo di lucro, ad esclusivo uso personale e familiare e destinata
        a una diffusione strettamente privata, limitata a persone di fiducia. Non è offerta al pubblico, non è un
        servizio commerciale e non comporta alcuna vendita, pubblicità o raccolta di compensi.
      </footer>
    </main>
  )
}
