// Edge Function: avvisa via email quando qualcuno invia un'idea (riga in public.feedback).
// Richiede il secret RESEND_API_KEY. verify_jwt è spento: l'identità viene verificata con auth.getUser(token).
// Destinatario: secret FEEDBACK_TO (se assente, andrea.valle.1973@gmail.com).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const FROM = 'Cosa manca <noreply@cosa-manca.it>'
const TO = Deno.env.get('FEEDBACK_TO') ?? 'andrea.valle.1973@gmail.com'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return json({ error: 'email_not_configured' }, 500)

  let id: string | undefined
  try {
    id = (await req.json()).id
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!id) return json({ error: 'bad_request' }, 400)

  // Identità di chi chiama: la RLS lascia leggere solo i propri messaggi.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: u, error: uerr } = await supabase.auth.getUser(token)
  if (!u.user) {
    console.error('auth error', uerr?.message)
    return json({ error: 'unauthorized' }, 401)
  }

  const { data: fb } = await supabase.from('feedback').select('kind, body, group_id, created_at').eq('id', id).maybeSingle()
  if (!fb) return json({ error: 'forbidden' }, 403)

  const [{ data: me }, { data: group }] = await Promise.all([
    supabase.from('profiles').select('display_name, email').eq('id', u.user.id).maybeSingle(),
    supabase.from('groups').select('name').eq('id', fb.group_id).maybeSingle(),
  ])
  const who = `${me?.display_name?.trim() || 'Senza nome'} <${me?.email ?? u.user.email}>`
  const kind = fb.kind === 'idea' ? 'Idea' : "Cos'altro ti manca"
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;color:#1c1c1c">
<h3>${kind} da ${esc(who)}</h3>
<p style="white-space:pre-wrap;font-size:16px">${esc(fb.body)}</p>
<p style="color:#666;font-size:13px">Gruppo: ${esc(group?.name ?? '-')}</p></div>`

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [TO],
      reply_to: me?.email ?? undefined,
      subject: `${kind} su Cosa manca`,
      html,
      text: `${kind} da ${who}\n\n${fb.body}\n\nGruppo: ${group?.name ?? '-'}`,
    }),
  })
  if (!r.ok) return json({ error: 'send_failed' }, 502)
  return json({ ok: true })
})
