// Edge Function: notifica riepilogativa agli amministratori quando qualcuno segna "manca" dei prodotti.
// verify_jwt spento: l'identità si verifica con auth.getUser(token). Le chiavi VAPID stanno in public.push_config
// (tabella leggibile solo dal service role). Una notifica per gruppo (tag), che si aggiorna con il conteggio.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const WINDOW_MIN = 30

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let groupId: string | undefined
  try {
    groupId = (await req.json()).group_id
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!groupId) return json({ error: 'bad_request' }, 400)

  const url = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: u } = await userClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''))
  if (!u.user) return json({ error: 'unauthorized' }, 401)

  // Il chiamante deve essere membro del gruppo (la RLS filtra le righe).
  const { data: grp } = await userClient.from('groups').select('name').eq('id', groupId).maybeSingle()
  if (!grp) return json({ error: 'forbidden' }, 403)

  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: cfg } = await db.from('push_config').select('public_key, private_key').eq('id', 1).maybeSingle()
  if (!cfg) return json({ error: 'push_not_configured' }, 500)
  webpush.setVapidDetails('mailto:andrea.valle.1973@gmail.com', cfg.public_key, cfg.private_key)

  const { data: adminRows } = await db.from('memberships').select('user_id').eq('group_id', groupId).eq('role', 'admin')
  // Ognuno spegne le notifiche solo per sé (profiles.notify_new).
  const { data: off } = await db
    .from('profiles')
    .select('id')
    .in(
      'id',
      (adminRows ?? []).map((r) => r.user_id),
    )
    .eq('notify_new', false)
  const offIds = new Set((off ?? []).map((r) => r.id))
  const admins = (adminRows ?? []).filter((r) => !offIds.has(r.user_id))
  const since = new Date(Date.now() - WINDOW_MIN * 60 * 1000).toISOString()
  const { data: recent } = await db
    .from('needs')
    .select('requested_by, group_items(name)')
    .eq('group_id', groupId)
    .eq('status', 'missing')
    .gte('requested_at', since)
    .order('requested_at')

  type R = { requested_by: string | null; group_items: { name: string } | { name: string }[] | null }
  const rows = (recent ?? []) as unknown as R[]
  let sent = 0
  for (const a of admins) {
    if (a.user_id === u.user.id) continue
    // riepilogo per questo admin: ciò che hanno segnato gli altri (non lui) negli ultimi minuti
    const names = rows
      .filter((r) => r.requested_by !== a.user_id)
      .map((r) => (Array.isArray(r.group_items) ? r.group_items[0]?.name : r.group_items?.name))
      .filter((n): n is string => Boolean(n))
    if (names.length === 0) continue
    const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ' e altri' : '')
    const body = names.length === 1 ? `Manca: ${shown}` : `Mancano ${names.length} prodotti in più: ${shown}`
    const payload = JSON.stringify({ title: grp.name, body, tag: `cm-${groupId}` })

    const { data: subs } = await db.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', a.user_id)
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 3600,
        })
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        else console.error('push error', code)
      }
    }
  }
  return json({ ok: true, sent })
})
