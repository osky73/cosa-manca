// Edge Function: richieste di ammissione come amministratore.
//   { action: 'new' }                  chiamata dalla persona appena messa "in attesa": avvisa il super admin (notifica push, e email se non ha notifiche attive)
//   { action: 'test' } prova di notifica per il super admin
//   { action: 'broadcast', title, message, email }  messaggio a tutti gli utenti (solo super admin)
//   { action: 'recipe', recipe_id }    chiamata dall'autore dopo aver proposto una ricetta a tutti: avvisa il super admin (push, o email)
//   { action: 'recipe_decided', recipe_id, approve }  super admin: se approva avvisa tutti gli utenti, se rifiuta solo l'autore
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
${cta ? `<p style="margin:0"><a href="${esc(cta.href)}" style="display:inline-block;background:#2f7d4f;color:#ffffff;padding:14px 26px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px">${cta.label}</a></p>` : ''}
</div>
</div>`

// Notifica push a tutti i dispositivi del super admin. Restituisce quante sono partite e i codici d'errore.
async function pushToSuper(db: ReturnType<typeof createClient>, payload: { title: string; body: string; tag: string }) {
  const out = { sent: 0, subs: 0, errors: [] as (number | string)[], reason: '' }
  const { data: sa } = await db.from('profiles').select('id').eq('email', SUPER_ADMIN).maybeSingle()
  if (!sa) return { ...out, reason: 'super_admin_non_trovato' }
  const { data: cfg } = await db.from('push_config').select('public_key, private_key').eq('id', 1).maybeSingle()
  if (!cfg) return { ...out, reason: 'chiavi_push_mancanti' }
  webpush.setVapidDetails(`mailto:${SUPER_ADMIN}`, cfg.public_key, cfg.private_key)
  const { data: subs } = await db.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', sa.id)
  out.subs = (subs ?? []).length
  if (out.subs === 0) out.reason = 'nessun_dispositivo_registrato'
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 86400 })
      out.sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      out.errors.push(code ?? 'errore')
      if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      else console.error('push error', code, (e as Error).message)
    }
  }
  return out
}

// Push a una lista di utenti (o a tutti se ids è null); chi ha spento gli avvisi dentro l'app non li riceve.
async function pushToUsers(db: ReturnType<typeof createClient>, ids: string[] | null, payload: { title: string; body: string; tag: string }, skip?: string) {
  const { data: cfg } = await db.from('push_config').select('public_key, private_key').eq('id', 1).maybeSingle()
  if (!cfg) return 0
  webpush.setVapidDetails(`mailto:${SUPER_ADMIN}`, cfg.public_key, cfg.private_key)
  const { data: profs } = await db.from('profiles').select('id, notify_new')
  const off = new Set((profs ?? []).filter((p) => p.notify_new === false).map((p) => p.id))
  const { data: subs } = await db.from('push_subscriptions').select('endpoint, p256dh, auth, user_id')
  const list = (subs ?? []).filter((s) => (!ids || ids.includes(s.user_id)) && s.user_id !== skip && !off.has(s.user_id))
  const msg = JSON.stringify(payload)
  let sent = 0
  for (let i = 0; i < list.length; i += 20) {
    await Promise.all(
      list.slice(i, i + 20).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, msg, { TTL: 86400 })
          sent++
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode
          if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
          else console.error('recipe push error', code, (e as Error).message)
        }
      }),
    )
  }
  return sent
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: { action?: string; user_id?: string; recipe_id?: string; approve?: boolean; title?: string; message?: string; email?: boolean }
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
    const push = await pushToSuper(db, { title: 'Nuova richiesta di ammissione', body: `${who} chiede di creare un gruppo.`, tag: 'cm-admin-request' })
    const sent = push.sent
    console.log('new request push', JSON.stringify(push))
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

  if (body.action === 'test') {
    const { data: isSuper } = await userClient.rpc('is_super_admin')
    if (isSuper !== true) return json({ error: 'forbidden' }, 403)
    const push = await pushToSuper(db, { title: 'Prova notifica', body: 'Se leggi questo, le notifiche funzionano.', tag: 'cm-test' })
    return json({ ok: true, ...push })
  }

  if (body.action === 'broadcast') {
    const { data: isSuper } = await userClient.rpc('is_super_admin')
    if (isSuper !== true) return json({ error: 'forbidden' }, 403)
    const title = (body.title ?? '').trim().slice(0, 60) || 'Cosa manca'
    const text = (body.message ?? '').trim().slice(0, 300)
    if (!text) return json({ error: 'bad_request' }, 400)
    const { data: cfg } = await db.from('push_config').select('public_key, private_key').eq('id', 1).maybeSingle()
    if (!cfg) return json({ error: 'push_not_configured' }, 500)
    webpush.setVapidDetails(`mailto:${SUPER_ADMIN}`, cfg.public_key, cfg.private_key)

    const { data: profs } = await db.from('profiles').select('id, email, notify_new')
    const all = profs ?? []
    // chi ha spento gli avvisi dentro l'app non li riceve
    const off = new Set(all.filter((p) => p.notify_new === false).map((p) => p.id))
    const { data: subs } = await db.from('push_subscriptions').select('endpoint, p256dh, auth, user_id')
    const payload = JSON.stringify({ title, body: text, tag: 'cm-broadcast' })
    const reached = new Set<string>()
    let devices = 0
    const list = (subs ?? []).filter((s) => !off.has(s.user_id))
    for (let i = 0; i < list.length; i += 20) {
      await Promise.all(
        list.slice(i, i + 20).map(async (s) => {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 })
            devices++
            reached.add(s.user_id)
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode
            if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
            else console.error('broadcast push error', code, (e as Error).message)
          }
        }),
      )
    }

    // chi non è stato raggiunto da una notifica può ricevere una email (al massimo 80 per invio, per i limiti di Resend)
    let mailed = 0
    let toMail = 0
    if (body.email) {
      const targets = all.filter((p) => p.email && !reached.has(p.id) && p.email !== SUPER_ADMIN && !off.has(p.id))
      toMail = targets.length
      const html = card(esc(title), esc(text).replace(/\n/g, '<br>'), { href: SITE_URL, label: 'Apri Cosa manca' })
      for (const p of targets.slice(0, 80)) {
        if (await sendMail(p.email, title, html, `${text}\n\n${SITE_URL}`)) mailed++
      }
    }
    console.log('broadcast', JSON.stringify({ users_total: all.length, reached: reached.size, devices, mailed, toMail }))
    return json({ ok: true, users_total: all.length, users_reached: reached.size, devices, mailed, mail_targets: toMail })
  }

  if (body.action === 'recipe') {
    if (!body.recipe_id) return json({ error: 'bad_request' }, 400)
    const { data: r } = await db.from('recipes').select('title, author_name, created_by, public_status').eq('id', body.recipe_id).maybeSingle()
    if (!r || r.created_by !== u.user.id || r.public_status !== 'proposed') return json({ error: 'no_recipe' }, 404)
    const who = r.author_name?.trim() || 'Un utente'
    const push = await pushToSuper(db, { title: 'Ricetta proposta a tutti', body: `${who} propone «${r.title}».`, tag: 'cm-recipe' })
    let mailed = false
    if (push.sent === 0) {
      mailed = await sendMail(
        SUPER_ADMIN,
        'Ricetta proposta a tutti su Cosa manca',
        card('Ricetta proposta a tutti', `${esc(who)} propone la ricetta «${esc(r.title)}». Approvala o rifiutala dalla schermata Stato servizi (l'ingranaggio in alto a destra).`, { href: SITE_URL, label: 'Apri Cosa manca' }),
        `${who} propone la ricetta «${r.title}». Approvala dalla schermata Stato servizi: ${SITE_URL}`,
      )
    }
    return json({ ok: true, sent: push.sent, mailed })
  }

  if (body.action === 'recipe_decided') {
    const { data: isSuper } = await userClient.rpc('is_super_admin')
    if (isSuper !== true) return json({ error: 'forbidden' }, 403)
    if (!body.recipe_id) return json({ error: 'bad_request' }, 400)
    const { data: r } = await db.from('recipes').select('title, author_name, created_by, public_status').eq('id', body.recipe_id).maybeSingle()
    if (!r) return json({ error: 'no_recipe' }, 404)
    if (body.approve) {
      if (r.public_status !== 'public') return json({ error: 'not_public' }, 409)
      const who = r.author_name?.trim() || 'Un utente'
      const sent = await pushToUsers(db, null, { title: 'Nuova ricetta per tutti', body: `${who} ha condiviso «${r.title}». La trovi in Ricette.`, tag: 'cm-recipe-public' }, r.created_by)
      await pushToUsers(db, [r.created_by], { title: 'Ricetta pubblicata', body: `«${r.title}» è ora visibile a tutti.`, tag: 'cm-recipe-ok' })
      return json({ ok: true, sent })
    }
    await pushToUsers(db, [r.created_by], { title: 'Ricetta non pubblicata', body: `«${r.title}» non è stata condivisa con tutti.`, tag: 'cm-recipe-no' })
    return json({ ok: true })
  }

  if (body.action === 'decided') {
    const { data: isSuper } = await userClient.rpc('is_super_admin')
    if (isSuper !== true) return json({ error: 'forbidden' }, 403)
    if (!body.user_id) return json({ error: 'bad_request' }, 400)
    const { data: r } = await db.from('admin_requests').select('email, display_name, status').eq('user_id', body.user_id).maybeSingle()
    if (!r || r.status !== 'approved') return json({ error: 'not_approved' }, 409)
    const name = r.display_name?.trim()
    // link che porta dentro l'app già con l'accesso fatto; se non si riesce a crearlo si usa l'indirizzo semplice
    let href = SITE_URL
    const { data: gl, error: gerr } = await db.auth.admin.generateLink({ type: 'magiclink', email: r.email, options: { redirectTo: SITE_URL } })
    if (gerr) console.error('generateLink', gerr.message)
    else if (gl?.properties?.action_link) href = gl.properties.action_link
    const ok = await sendMail(
      r.email,
      'Sei dentro: puoi creare il tuo gruppo su Cosa manca',
      card(
        `${name ? `${esc(name)}, ` : ''}sei stato ammesso`,
        'L\'amministratore ti ha ammesso a Cosa manca. Tocca il pulsante: entri nell\'app e ti guidiamo a creare il tuo gruppo e a invitare le persone con cui vivi.',
        { href, label: 'Entra in Cosa manca' },
      ),
      `${name ? `${name}, ` : ''}sei stato ammesso a Cosa manca. Entra da qui: ${href}`,
    )
    return json({ ok, mailed: ok })
  }

  return json({ error: 'bad_request' }, 400)
})
