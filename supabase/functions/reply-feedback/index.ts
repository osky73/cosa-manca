// Edge Function: il super admin risponde via email a chi ha scritto in "Idee" (riga in public.feedback).
// Richiede il secret RESEND_API_KEY. verify_jwt è spento: l'identità viene verificata con auth.getUser(token)
// e il ruolo con la funzione is_super_admin() eseguita con il token di chi chiama.
// Il messaggio originale e l'indirizzo di chi ha scritto si leggono con la service role (la RLS non li mostra).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const FROM = 'Cosa manca <noreply@cosa-manca.it>'
const REPLY_TO = Deno.env.get('FEEDBACK_TO') ?? 'andrea.valle.1973@gmail.com'

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
  let message = ''
  try {
    const b = await req.json()
    id = b.id
    message = String(b.message ?? '').trim()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!id || !message || message.length > 4000) return json({ error: 'bad_request' }, 400)

  const auth = req.headers.get('Authorization') ?? ''
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })
  const { data: u } = await asUser.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
  if (!u.user) return json({ error: 'unauthorized' }, 401)
  const { data: isSuper } = await asUser.rpc('is_super_admin')
  if (isSuper !== true) return json({ error: 'forbidden' }, 403)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: fb } = await admin.from('feedback').select('kind, body, user_id').eq('id', id).maybeSingle()
  if (!fb) return json({ error: 'not_found' }, 404)
  const { data: to } = await admin.from('profiles').select('display_name, email').eq('id', fb.user_id).maybeSingle()
  if (!to?.email) return json({ error: 'no_email' }, 422)

  const name = to.display_name?.trim() || ''
  const what = fb.kind === 'idea' ? 'il tuo messaggio' : 'quello che ti manca'
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;color:#1c1c1c">
<p>${name ? `Ciao ${esc(name)},` : 'Ciao,'}</p>
<p style="white-space:pre-wrap;font-size:16px">${esc(message)}</p>
<p style="color:#666;font-size:13px;border-left:3px solid #ddd;padding-left:10px;white-space:pre-wrap">In risposta a ${what}:<br>${esc(fb.body)}</p>
<p style="color:#666;font-size:13px">Puoi rispondere a questa email. Grazie, Cosa manca</p></div>`

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [to.email],
      reply_to: REPLY_TO,
      subject: 'Risposta da Cosa manca',
      html,
      text: `${name ? `Ciao ${name},` : 'Ciao,'}\n\n${message}\n\n---\nIn risposta a ${what}:\n${fb.body}`,
    }),
  })
  if (!r.ok) return json({ error: 'send_failed' }, 502)
  return json({ ok: true })
})
