// Edge Function: invia l'email di invito a una persona già invitata (riga in public.invitations).
// Chiamata dall'app dall'admin del gruppo. Richiede il secret RESEND_API_KEY (chiave Resend "Sending access").
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://cosa-manca.it'
const FROM = 'Cosa manca <noreply@cosa-manca.it>'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return json({ error: 'email_not_configured' }, 500)

  let body: { group_id?: string; email?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const groupId = body.group_id
  const email = body.email?.trim().toLowerCase()
  if (!groupId || !email) return json({ error: 'bad_request' }, 400)

  // Client con l'identità di chi chiama: la RLS lascia vedere gli inviti solo agli admin del gruppo.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })

  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401)

  const { data: inv } = await supabase
    .from('invitations')
    .select('id, role')
    .eq('group_id', groupId)
    .eq('email', email)
    .maybeSingle()
  if (!inv) return json({ error: 'forbidden' }, 403)

  const [{ data: group }, { data: me }] = await Promise.all([
    supabase.from('groups').select('name').eq('id', groupId).maybeSingle(),
    supabase.from('profiles').select('display_name, email').eq('id', userData.user.id).maybeSingle(),
  ])
  const groupName = group?.name ?? 'casa'
  const roleLabel = inv.role === 'admin' ? 'amministratore' : 'utente'
  const inviter = me?.display_name?.trim() || me?.email || 'Qualcuno'

  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#1c1c1c">
<h2>${esc(inviter)} ti ha invitato su Cosa manca</h2>
<p>Cosa manca è la lista di ciò che manca in casa, condivisa in famiglia. Sei stato aggiunto al gruppo <b>${esc(groupName)}</b> come <b>${roleLabel}</b>.</p>
<p><a href="${SITE_URL}" style="display:inline-block;background:#2f7d4f;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Apri Cosa manca</a></p>
<p>Come entrare:</p>
<ol>
<li>Apri <a href="${SITE_URL}">${SITE_URL.replace('https://', '')}</a> dal telefono.</li>
<li>Scrivi questa email (<b>${esc(email)}</b>) e tocca "Ricevi il codice".</li>
<li>Inserisci il codice che ti arriva via email.</li>
<li>Per averla sulla Home, tocca "Installa l'app".</li>
</ol>
</div>`

  const text = `${inviter} ti ha invitato su Cosa manca, nel gruppo "${groupName}", come ${roleLabel}.\n\nApri ${SITE_URL}, accedi con ${email} (ti arriva un codice via email) e, se vuoi, installa l'app sulla Home.`

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      subject: `${inviter} ti ha invitato su Cosa manca`,
      html,
      text,
    }),
  })
  if (!r.ok) {
    console.error('resend error', r.status, await r.text())
    return json({ error: 'send_failed' }, 502)
  }
  return json({ ok: true })
})
