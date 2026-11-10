// Edge Function: richieste di ammissione come amministratore.
//   { action: 'new' }                  chiamata dalla persona appena messa "in attesa": avvisa il super admin (notifica push, e email se non ha notifiche attive)
//   { action: 'decided', user_id }     chiamata dal super admin dopo aver ammesso: scrive alla persona che può creare il suo gruppo
// verify_jwt spento: identità con auth.getUser, ruolo con is_super_admin(), come le altre funzioni.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://cosa-manca.it'
const FROM = 'Cosa manca <noreply@cosa-manca.it>'
const SUPER_ADMIN = 'andrea.valle.1973@gmail.com'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function sendMail(to: string, subject: string, html: string, text: string) {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return false
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
  })
  if (!r.ok) console.error('resend error', r.status, await r.text())
  return r.ok
}

const card = (title: string, body: string, cta?: { href: string; label: string }) => `<div style="background:#f6f3ee;padding:24px 12px">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 24px;color:#1c1c1c;font-size:16px;line-height:1.5">
<div style="font-size:14px;font-weight:700;color:#2f7d4f;letter-spacing:.4px;margin:0 0 14px">COSA MANCA</div>
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:800">${title}</h1>
<p style="margin:0 0 ${cta ? 22 : 0}px">${body}</p>
${cta ? `<p style="margin:0"><a href="${cta.href}" style="display:inline-block;background:#2f7d4f;color:#ffffff;padding:14px 26px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px">${cta.label}</a></p>` : ''}
</div>
</div>`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: { action?: string; user_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
  const { data: u } = await userClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''))
  if (!u.user) return json({ error: 'unauthorized' }, 401)
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  if (body.action === 'new') {
    const { data: r } = await db.from('admin_requests').select('email, display_name, status, notified').eq('user_id', u.user.id).maybeSingle()
    if (!r || r.status !== 'pending') return json({ error: 'no_request' }, 404)
    if (r.notified) return json({ ok: true, already: true })
    await db.from('admin_requests').update({ notified: true }).eq('user_id', u.user.id)

    const who = r.display_name?.trim() ? `${r.display_name.trim()} (${r.email})` : r.email
    const { data: sa } = await db.from('profiles').select('id').eq('email', SUPER_ADMIN).maybeSingle()
    let sent = 0
    if (sa) {
      const { data: cfg } = await db.from('push_config').select('public_key, private_key').eq('id', 1).maybeSingle()
      if (cfg) {
        webpush.setVapidDetails(`mailto:${SUPER_ADMIN}`, cfg.public_key, cfg.private_key)
        const payload = JSON.stringify({ title: 'Nuova richiesta di ammissione', body: `${who} chiede di creare un gruppo.`, tag: 'cm-admin-request' })
        const { data: subs } = await db.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', sa.id)
        for (const s of subs ?? []) {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 })
            sent++
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode
            if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
            else console.error('push error', code)
          }
        }
      }
    }
    let mailed = false
    if (sent === 0) {
      mailed = await sendMail(
        SUPER_ADMIN,
        'Nuova richiesta di ammissione a Cosa manca',
        card('Nuova richiesta di ammissione', `${esc(who)} chiede di creare un gruppo. Aprila nella schermata Stato servizi (l'ingranaggio in alto a destra) per ammetterla.`, { href: SITE_URL, label: 'Apri Cosa manca' }),
        `${who} chiede di creare un gruppo. Ammettila dalla schermata Stato servizi: ${SITE_URL}`,
      )
    }
    return json({ ok: true, sent, mailed })
  }

  if (body.action === 'decided') {
    const { data: isSuper } = await userClient.rpc('is_super_admin')
    if (isSuper !== true) return json({ error: 'forbidden' }, 403)
    if (!body.user_id) return json({ error: 'bad_request' }, 400)
    const { data: r } = await db.from('admin_requests').select('email, display_name, status').eq('user_id', body.user_id).maybeSingle()
    if (!r || r.status !== 'approved') return json({ error: 'not_approved' }, 409)
    const name = r.display_name?.trim()
    const ok = await sendMail(
      r.email,
      'Sei dentro: puoi creare il tuo gruppo su Cosa manca',
      card(
        `${name ? `${esc(name)}, ` : ''}sei stato ammesso`,
        'Ora puoi creare il tuo gruppo su Cosa manca. Apri l\'app e accedi con questa email: ti chiederà il nome del gruppo e potrai subito invitare le persone con cui vivi.',
        { href: SITE_URL, label: 'Apri Cosa manca' },
      ),
      `${name ? `${name}, ` : ''}sei stato ammesso a Cosa manca. Apri ${SITE_URL}, accedi con questa email e crea il tuo gruppo.`,
    )
    return json({ ok, mailed: ok })
  }

  return json({ error: 'bad_request' }, 400)
})
