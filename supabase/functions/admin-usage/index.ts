// Edge Function: consumi dei servizi esterni per la schermata "Stato servizi" (solo super admin).
// Secrets (tutti facoltativi: se manca uno, quel riquadro mostra "non collegato"):
//   RESEND_API_KEY      invii email del mese (si legge dalle intestazioni dell'API)
//   VERCEL_TOKEN        token Vercel (sola lettura) + VERCEL_TEAM_ID se il progetto è in un team
//   SUPABASE_ACCESS_TOKEN  token personale Supabase per leggere l'uso (egress, storage)
// verify_jwt è spento: identità con auth.getUser e ruolo con is_super_admin(), come le altre funzioni.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function resend() {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return null
  const since = new Date(Date.now() - 30 * 86400000)
  let sent = 0
  let today = 0
  const day = new Date().toISOString().slice(0, 10)
  let after = ''
  for (let i = 0; i < 10; i++) {
    const r = await fetch(`https://api.resend.com/emails?limit=100${after}`, { headers: { Authorization: `Bearer ${key}` } })
    if (r.status === 401 || r.status === 403) return { error: 'solo_invio' as const }
    if (!r.ok) return { error: `http_${r.status}` as const }
    const j = await r.json()
    const rows: { created_at: string; id: string }[] = j.data ?? []
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
    for (const e of rows) {
      const d = new Date(e.created_at)
      if (d >= monthStart) sent++
      if (e.created_at.slice(0, 10) === day) today++
    }
    const last = rows[rows.length - 1]
    if (!j.has_more || !last || new Date(last.created_at) < since) break
    after = `&after=${last.id}`
  }
  return { month: sent, today }
}

async function vercel() {
  const token = Deno.env.get('VERCEL_TOKEN')
  if (!token) return null
  const team = Deno.env.get('VERCEL_TEAM_ID')
  const q = team ? `?teamId=${team}&limit=100` : '?limit=100'
  const r = await fetch(`https://api.vercel.com/v6/deployments${q}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) return null
  const j = await r.json()
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0)
  const list: { created: number }[] = j.deployments ?? []
  return {
    deploys_month: list.filter((d) => d.created >= monthStart.getTime()).length,
    deploys_today: list.filter((d) => d.created >= dayStart.getTime()).length,
  }
}

async function supabaseUsage() {
  const token = Deno.env.get('SUPABASE_ACCESS_TOKEN')
  const ref = (Deno.env.get('SUPABASE_URL') ?? '').match(/https:\/\/([^.]+)\./)?.[1]
  if (!token || !ref) return null
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/usage.api-counts`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!r.ok) return null
  const j = await r.json()
  const rows: { total_rest_requests?: number; total_auth_requests?: number; total_storage_requests?: number }[] = j.result ?? []
  const sum = (k: 'total_rest_requests' | 'total_auth_requests' | 'total_storage_requests') =>
    rows.reduce((a, x) => a + (x[k] ?? 0), 0)
  return { rest: sum('total_rest_requests'), auth: sum('total_auth_requests'), storage: sum('total_storage_requests') }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const auth = req.headers.get('Authorization') ?? ''
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })
  const { data: u } = await asUser.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
  if (!u.user) return json({ error: 'unauthorized' }, 401)
  const { data: isSuper } = await asUser.rpc('is_super_admin')
  if (isSuper !== true) return json({ error: 'forbidden' }, 403)

  const [r, v, s] = await Promise.all([resend().catch(() => null), vercel().catch(() => null), supabaseUsage().catch(() => null)])
  return json({ resend: r, vercel: v, supabase: s })
})
