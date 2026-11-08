// Edge Function: un utente (qualsiasi ruolo) consiglia Cosa manca a qualcuno via email.
// verify_jwt è spento: l'identità viene verificata con auth.getUser(token). Limite: 10 email ogni 24 ore per utente.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://cosa-manca.it'
const FROM = 'Cosa manca <noreply@cosa-manca.it>'
const DAILY_LIMIT = 10

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

  let email = ''
  try {
    email = String((await req.json()).email ?? '').trim().toLowerCase()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return json({ error: 'bad_email' }, 400)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: u, error: uerr } = await supabase.auth.getUser(token)
  if (!u.user) {
    console.error('auth error', uerr?.message)
    return json({ error: 'unauthorized' }, 401)
  }

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count } = await supabase
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', u.user.id)
    .gte('created_at', since)
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: 'rate_limited' }, 429)

  const { data: me } = await supabase.from('profiles').select('display_name, email').eq('id', u.user.id).maybeSingle()
  const sender = me?.display_name?.trim() || me?.email || 'Un amico'
  const site = SITE_URL.replace('https://', '')

  const html = `<div style="background:#f6f3ee;padding:24px 12px">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 24px;color:#1c1c1c;font-size:16px;line-height:1.5">
<div style="font-size:14px;font-weight:700;color:#2f7d4f;letter-spacing:.4px;margin:0 0 14px">COSA MANCA</div>
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:800">${esc(sender)} ti consiglia Cosa manca</h1>
<p style="margin:0 0 22px">Sai quando chiami a casa e chiedi «cosa manca?» e nessuno ha voglia di andare a vedere? Cosa manca è la lista di ciò che manca in casa, condivisa con chi vive con te: si segna con un gesto e si vede subito da tutti.</p>
<p style="margin:0 0 26px"><a href="${SITE_URL}" style="display:inline-block;background:#2f7d4f;color:#ffffff;padding:14px 26px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px">Scopri Cosa manca</a></p>
<p style="margin:0;color:#777;font-size:13px">Hai ricevuto questa email perché ${esc(sender)} ha inserito il tuo indirizzo. Se non ti interessa, ignorala: non ti scriveremo più.</p>
</div>
</div>`
  const text = `${sender} ti consiglia Cosa manca, la lista di ciò che manca in casa, condivisa con chi vive con te.\n\nScoprila su ${SITE_URL}\n\nHai ricevuto questa email perché ${sender} ha inserito il tuo indirizzo. Se non ti interessa, ignorala.`

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      reply_to: me?.email ?? undefined,
      subject: `${sender} ti consiglia Cosa manca`,
      html,
      text,
    }),
  })
  if (!r.ok) {
    console.error('resend error', r.status, await r.text())
    return json({ error: 'send_failed' }, 502)
  }
  await supabase.from('referrals').insert({ email })
  return json({ ok: true })
})
