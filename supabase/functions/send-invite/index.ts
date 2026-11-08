// Edge Function: invia l'email di invito a una persona già invitata (riga in public.invitations).
// verify_jwt è spento: l'identità viene verificata qui sotto con auth.getUser(token).
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

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
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
  const inviter = me?.display_name?.trim() || me?.email || 'Qualcuno'

  const site = SITE_URL.replace('https://', '')
  const html = `<div style="background:#f6f3ee;padding:24px 12px">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 24px;color:#1c1c1c;font-size:16px;line-height:1.5">
<div style="font-size:14px;font-weight:700;color:#2f7d4f;letter-spacing:.4px;margin:0 0 14px">COSA MANCA</div>
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:800">${esc(inviter)} ti ha invitato su Cosa manca</h1>
<p style="margin:0 0 22px">Cosa manca è l'app per gestire la lista di ciò che manca in casa, condivisa con i tuoi conviventi. Sei stato aggiunto al gruppo <b>${esc(groupName)}</b>.</p>
<p style="margin:0 0 26px"><a href="${SITE_URL}" style="display:inline-block;background:#2f7d4f;color:#ffffff;padding:14px 26px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px">Accedi ora</a></p>
<p style="margin:0 0 8px;font-weight:700">Come entrare</p>
<ol style="margin:0;padding-left:22px">
<li style="margin:0 0 8px">Apri <a href="${SITE_URL}" style="color:#2f7d4f">${site}</a> dal telefono.</li>
<li style="margin:0 0 8px">Registrati con questa email (<b>${esc(email)}</b>) e clicca su "Ricevi il codice".</li>
<li style="margin:0">Inserisci il codice che ti arriva via email nella schermata seguente: sei dentro.</li>
</ol>
</div>
</div>`

  const text = `${inviter} ti ha invitato su Cosa manca, nel gruppo "${groupName}".\n\nApri ${SITE_URL}, registrati con ${email} e clicca su "Ricevi il codice": ti arriva un codice via email, lo inserisci nella schermata seguente e sei dentro.`

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
