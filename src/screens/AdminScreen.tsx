import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

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
  resend: { month: number; today: number } | null
  vercel: { deploys_month: number } | null
  supabase: { rest: number; auth: number; storage: number } | null
}

const nf = new Intl.NumberFormat('it-IT')
const mb = (b: number) => (b / 1048576).toLocaleString('it-IT', { maximumFractionDigits: 1 })

// Limiti dei piani gratuiti (valori ufficiali al momento della scrittura; i fornitori possono cambiarli)
const FREE = {
  db: 500, // MB Supabase
  mau: 50000, // utenti attivi al mese Supabase
  resendMonth: 3000,
  resendDay: 100,
  vercelDeploys: 100, // distribuzioni al giorno, Hobby
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

export default function AdminScreen() {
  const [s, setS] = useState<Stats | null>(null)
  const [ext, setExt] = useState<External | null>(null)
  const [err, setErr] = useState(false)

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
      <Meter label="Email questo mese" value={ext ? (ext.resend?.month ?? null) : null} max={FREE.resendMonth} />
      <Meter label="Email oggi" value={ext ? (ext.resend?.today ?? null) : null} max={FREE.resendDay} />

      <h2>Vercel <small>piano Hobby</small></h2>
      <Meter label="Pubblicazioni questo mese" value={ext ? (ext.vercel?.deploys_month ?? null) : null} max={FREE.vercelDeploys * 30} note="Il limite vero è di 100 al giorno." />

      <h2>Google Maps <small>quote gratuite mensili</small></h2>
      <Meter label="Caricamenti della mappa" value={s?.map_load ?? null} max={FREE.mapLoad} />
      <Meter label="Ricerche negozi" value={s?.map_search ?? null} max={FREE.mapSearch} />
      <Meter label="Orari di apertura" value={s?.map_details ?? null} max={FREE.mapDetails} />
      <p className="muted small">Conteggio fatto dall'app. Il dato ufficiale è nella Console Google Cloud (Metriche).</p>
    </section>
  )
}
