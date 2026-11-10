import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = Boolean(url && key)

export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

// Link di ammissione ricevuto per email: i token arrivano nell'indirizzo, li trasformo in sessione e pulisco l'indirizzo.
if (typeof window !== 'undefined' && /access_token=/.test(window.location.hash) && /refresh_token=/.test(window.location.hash)) {
  const h = new URLSearchParams(window.location.hash.slice(1))
  const access_token = h.get('access_token')
  const refresh_token = h.get('refresh_token')
  if (access_token && refresh_token) {
    void supabase.auth.setSession({ access_token, refresh_token }).finally(() => {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    })
  }
}
