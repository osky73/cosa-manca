import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { Sheet } from '../components'

interface Stats {
  users_total: number
  users_30d: number
  users_7d_new: number
  groups_total: number
  groups_active_30d: number
  needs_total: number
  db_bytes: number
  map_load: number
  map_search: number
  map_details: number
}
interface External {
  resend: { month?: number; today?: number; error?: string } | null
  vercel: { deploys_month: number; deploys_today: number } | null
  supabase: { rest: number; auth: number; storage: number } | null
}

interface Req {
  user_id: string
  email: string
  display_name: string | null
  created_at: string
}

const nf = new Intl.NumberFormat('it-IT')
const mb = (b: number) => (b / 1048576).toLocaleString('it-IT', { maximumFractionDigits: 1 })

// Limiti dei piani gratuiti (valori ufficiali al momento della scrittura; i fornitori possono cambiarli)
const FREE = {
  db: 500, // MB Supabase
  mau: 50000, // utenti attivi al mese Supabase
  resendMonth: 3000,
  resendDay: 100,
  vercelDay: 100, // distribuzioni al giorno, Hobby
  mapLoad: 10000,
  mapSearch: 5000,
  mapDetails: 1000,
}

function Meter({ label, value, max, unit, note }: { label: string; value: number | null; max: number; unit?: string; note?: string }) {
  if (value == null)
    return (
      <div className="meter">
        <div className="meter-top">
          <span>{label}</span>
          <span className="meter-off">non collegato</span>
        </div>
      </div>
    )
  const pct = Math.min(100, (value / max) * 100)
  const tone = pct >= 90 ? 'hot' : pct >= 70 ? 'warm' : ''
  return (
    <div className="meter">
      <div className="meter-top">
        <span>{label}</span>
        <span>
          <b>{unit === 'MB' ? mb(value * 1048576) : nf.format(value)}</b> / {nf.format(max)} {unit ?? ''}
        </span>
      </div>
      <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <i className={tone} style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%` }} />
      </div>
      {note && <small>{note}</small>}
    </div>
  )
}

function Stat({ n, label }: { n: number | null; label: string }) {
  return (
    <div className="stat">
      <b>{n == null ? '–' : nf.format(n)}</b>
      <span>{label}</span>
    </div>
  )
}

function Requests({ onCount }: { onCount: (n: number) => void }) {
  const [reqs, setReqs] = useState<Req[] | null>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  async function load() {
    const { data } = await supabase.rpc('admin_requests_list')
    const rows = Array.isArray(data) ? (data as Req[]) : []
    setReqs(rows)
    onCount(rows.length)
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function decide(r: Req, approve: boolean) {
    setBusy(r.user_id)
    setMsg('')
    const { error } = await supabase.rpc('decide_admin_request', { p_user: r.user_id, p_approve: approve })
    if (error) {
      setMsg('Non sono riuscito a salvare. Riprova.')
    } else if (approve) {
      const { data } = await supabase.functions.invoke('admin-request', { body: { action: 'decided', user_id: r.user_id } })
      const mailed = (data as { mailed?: boolean } | null)?.mailed
      setMsg(mailed ? `${r.display_name || r.email} è stato ammesso e gli ho scritto.` : `${r.display_name || r.email} è stato ammesso, ma l'email non è partita: avvisalo tu.`)
    } else setMsg(`Richiesta di ${r.display_name || r.email} rifiutata.`)
    setBusy('')
    await load()
  }

  if (reqs == null || (reqs.length === 0 && !msg)) return null
  return (
    <>
      <h2>Richieste di ammissione</h2>
      {reqs.map((r) => (
        <div className="req" key={r.user_id}>
          <div className="req-who">
            <b>{r.display_name || 'Senza nome'}</b>
            <span>{r.email}</span>
            <small>{new Date(r.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}</small>
          </div>
          <div className="req-btns">
            <button className="btn primary" disabled={busy === r.user_id} onClick={() => void decide(r, true)}>
              Ammetti
            </button>
            <button className="btn" disabled={busy === r.user_id} onClick={() => void decide(r, false)}>
              Rifiuta
            </button>
          </div>
        </div>
      ))}
      {msg && <p className="muted small">{msg}</p>}
    </>
  )
}

function PushTest() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  async function test() {
    setBusy(true)
    setMsg('')
    const { data, error } = await supabase.functions.invoke('admin-request', { body: { action: 'test' } })
    setBusy(false)
    const r = data as { sent?: number; subs?: number; errors?: (number | string)[]; reason?: string } | null
    if (error || !r) setMsg('Non sono riuscito a fare la prova. Riprova.')
    else if (r.reason === 'nessun_dispositivo_registrato')
      setMsg('Nessun telefono è registrato per le notifiche su questo account. Attivale dall\'app e riprova.')
    else if (r.reason) setMsg(`Le notifiche non sono configurate (${r.reason}).`)
    else if ((r.sent ?? 0) > 0)
      setMsg(
        `Notifica inviata a ${r.sent} dispositivo/i. Se non ti arriva, controlla che le notifiche dell'app siano consentite nelle impostazioni del telefono.` +
          ((r.errors?.length ?? 0) > 0 ? ` (${r.errors!.length} dispositivo/i non raggiungibile/i)` : ''),
      )
    else setMsg(`Il servizio notifiche ha rifiutato l'invio (codice ${r.errors?.join(', ') || 'sconosciuto'}). Probabilmente il telefono va registrato di nuovo.`)
  }
  return (
    <>
      <h2>Notifiche</h2>
      <button className="btn" disabled={busy} onClick={() => void test()}>
        {busy ? 'Invio…' : 'Prova notifica'}
      </button>
      {msg && <p className="muted small">{msg}</p>}
    </>
  )
}

function Broadcast() {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [force, setForce] = useState(true)
  const [email, setEmail] = useState(false)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function send() {
    setBusy(true)
    setMsg('')
    const { data, error } = await supabase.functions.invoke('admin-request', {
      body: { action: 'broadcast', title, message: text, force, email },
    })
    setBusy(false)
    setAsking(false)
    const r = data as { ok?: boolean; users_total?: number; users_reached?: number; devices?: number; mailed?: number; mail_targets?: number } | null
    if (error || !r?.ok) {
      setMsg('Non sono riuscito a inviare. Riprova tra poco.')
      return
    }
    const rest = (r.users_total ?? 0) - (r.users_reached ?? 0)
    setMsg(
      `Notifica arrivata a ${r.users_reached} utenti su ${r.users_total} (${r.devices} telefoni).` +
        (rest > 0 ? ` ${rest} non hanno le notifiche attive sul telefono.` : '') +
        (email ? ` Email inviate: ${r.mailed}${(r.mail_targets ?? 0) > (r.mailed ?? 0) ? ` su ${r.mail_targets}` : ''}.` : ''),
    )
    setText('')
    setTitle('')
  }

  return (
    <>
      <h2>Messaggio agli utenti</h2>
      <div className="stack">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Titolo (facoltativo)" aria-label="Titolo" />
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Scrivi il messaggio" aria-label="Messaggio" />
        <label className="check">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
          <span>Anche a chi ha spento gli avvisi dentro l'app</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
          <span>Manda una email a chi non riceve la notifica</span>
        </label>
        <button className="btn primary" disabled={!text.trim() || busy} onClick={() => setAsking(true)}>
          Invia a tutti
        </button>
        <p className="muted small">Se un utente ha bloccato le notifiche dal telefono, l'app non può forzarle: per lui resta l'email.</p>
        {msg && <p className="muted small">{msg}</p>}
      </div>
      {asking && (
        <Sheet title="Inviare a tutti?" onClose={() => setAsking(false)}>
          <p className="hint">
            <b>{title.trim() || 'Cosa manca'}</b>
            <br />
            {text.trim()}
          </p>
          <div className="stack">
            <button className="btn primary wide" disabled={busy} onClick={() => void send()}>
              {busy ? 'Invio…' : 'Sì, invia'}
            </button>
            <button className="btn ghost wide" onClick={() => setAsking(false)}>
              Annulla
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}

interface RcpProp {
  id: string
  title: string
  steps: string | null
  ingredients: string[]
  author_name: string | null
  proposed_at: string
}

function RecipeProposals({ onCount }: { onCount: (n: number) => void }) {
  const [rows, setRows] = useState<RcpProp[] | null>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [openId, setOpenId] = useState('')

  async function load() {
    const { data } = await supabase.rpc('recipes_proposed')
    const r = Array.isArray(data) ? (data as RcpProp[]) : []
    setRows(r)
    onCount(r.length)
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function decide(r: RcpProp, approve: boolean) {
    setBusy(r.id)
    setMsg('')
    const { error } = await supabase.rpc('decide_recipe', { p_id: r.id, p_approve: approve })
    if (error) setMsg('Non sono riuscito a salvare. Riprova.')
    else {
      await supabase.functions.invoke('admin-request', { body: { action: 'recipe_decided', recipe_id: r.id, approve } }).catch(() => null)
      setMsg(approve ? `«${r.title}» è ora per tutti: ho avvisato gli utenti.` : `«${r.title}» non pubblicata.`)
    }
    setBusy('')
    await load()
  }

  if (rows == null || (rows.length === 0 && !msg)) return null
  return (
    <>
      <h2>Ricette proposte</h2>
      {rows.map((r) => (
        <div className="req" key={r.id}>
          <div className="req-who">
            <b>{r.title}</b>
            <span>di {r.author_name || 'un utente'}</span>
            <small>
              {r.ingredients.length} ingredienti ·{' '}
              <button type="button" className="linkbtn" onClick={() => setOpenId(openId === r.id ? '' : r.id)}>
                {openId === r.id ? 'nascondi' : 'leggi'}
              </button>
            </small>
            {openId === r.id && (
              <small style={{ whiteSpace: 'pre-wrap' }}>
                {r.ingredients.join(', ')}
                {r.steps ? `\n\n${r.steps}` : ''}
              </small>
            )}
          </div>
          <div className="req-btns">
            <button className="btn primary" disabled={busy === r.id} onClick={() => void decide(r, true)}>
              Pubblica
            </button>
            <button className="btn" disabled={busy === r.id} onClick={() => void decide(r, false)}>
              Rifiuta
            </button>
          </div>
        </div>
      ))}
      {msg && <p className="muted small">{msg}</p>}
    </>
  )
}

export default function AdminScreen({ onCount = () => {} }: { onCount?: (n: number) => void }) {
  const [s, setS] = useState<Stats | null>(null)
  const [ext, setExt] = useState<External | null>(null)
  const [err, setErr] = useState(false)
  const reqN = useRef(0)
  const rcpN = useRef(0)

  useEffect(() => {
    let off = false
    supabase.rpc('admin_stats').then(({ data, error }) => {
      if (off) return
      if (error || !data) setErr(true)
      else setS(data as Stats)
    })
    supabase.functions.invoke('admin-usage').then(({ data, error }) => {
      if (off) return
      setExt(error || !data ? { resend: null, vercel: null, supabase: null } : (data as External))
    })
    return () => {
      off = true
    }
  }, [])

  return (
    <section className="screen admin">
      <div className="top">
        <div className="top-row">
          <h1>Stato servizi</h1>
        </div>
      </div>

      {err && <p className="muted">Non riesco a leggere i dati. Riprova tra poco.</p>}

      <Requests onCount={(n) => { reqN.current = n; onCount(reqN.current + rcpN.current) }} />
      <RecipeProposals onCount={(n) => { rcpN.current = n; onCount(reqN.current + rcpN.current) }} />
      <PushTest />
      <Broadcast />

      <h2>Chi usa l'app</h2>
      <div className="stats">
        <Stat n={s?.users_total ?? null} label="Utenti registrati" />
        <Stat n={s?.users_30d ?? null} label="Attivi negli ultimi 30 giorni" />
        <Stat n={s?.users_7d_new ?? null} label="Nuovi negli ultimi 7 giorni" />
        <Stat n={s?.groups_total ?? null} label="Gruppi attivati" />
        <Stat n={s?.groups_active_30d ?? null} label="Gruppi attivi (30 giorni)" />
        <Stat n={s?.needs_total ?? null} label="Cose segnate come mancanti" />
      </div>

      <h2>Supabase <small>piano gratuito</small></h2>
      <Meter label="Database" value={s ? s.db_bytes / 1048576 : null} max={FREE.db} unit="MB" />
      <Meter label="Utenti attivi al mese" value={s?.users_30d ?? null} max={FREE.mau} />
      {ext?.supabase && (
        <p className="muted small">Richieste dell'ultimo giorno: {nf.format(ext.supabase.rest)} dati · {nf.format(ext.supabase.auth)} accessi</p>
      )}

      <h2>Resend <small>email, piano gratuito</small></h2>
      <Meter label="Email questo mese" value={ext?.resend && !ext.resend.error ? (ext.resend.month ?? null) : null} max={FREE.resendMonth} />
      <Meter label="Email oggi" value={ext?.resend && !ext.resend.error ? (ext.resend.today ?? null) : null} max={FREE.resendDay} />

      {ext?.resend?.error && (
        <p className="muted small">
          {ext.resend.error === 'solo_invio'
            ? 'La chiave Resend dell\'app può solo inviare email: per leggere i consumi serve una chiave con accesso completo (Full access).'
            : `Resend non risponde (${ext.resend.error}).`}
        </p>
      )}

      <h2>Vercel <small>piano Hobby</small></h2>
      <Meter label="Pubblicazioni oggi" value={ext ? (ext.vercel?.deploys_today ?? null) : null} max={FREE.vercelDay} />
      {ext?.vercel && <p className="muted small">Pubblicazioni questo mese: {nf.format(ext.vercel.deploys_month)}</p>}

      <h2>Google Maps <small>quote gratuite mensili</small></h2>
      <Meter label="Caricamenti della mappa" value={s?.map_load ?? null} max={FREE.mapLoad} />
      <Meter label="Ricerche negozi" value={s?.map_search ?? null} max={FREE.mapSearch} />
      <Meter label="Orari di apertura" value={s?.map_details ?? null} max={FREE.mapDetails} />
      <p className="muted small">Conteggio fatto dall'app. Il dato ufficiale è nella Console Google Cloud (Metriche).</p>
    </section>
  )
}
