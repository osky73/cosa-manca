import { supabase } from './supabase'

const VAPID_PUBLIC = 'BEplnScRjFdj9pD7kHH4GHjkHeDitHaAJ_jjD9Vi6ET6hwM4USxt49CRbDSC1e0ZedPZa7aeWVtUSFEVL3OMPrU'

function key(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** Iscrive questo telefono alle notifiche. Se il permesso non c'è ancora, lo chiede (serve un tocco dell'utente). */
export async function subscribePush(userId: string): Promise<void> {
  if (!pushSupported() || Notification.permission === 'denied') return
  try {
    if (Notification.permission === 'default') {
      const p = await Notification.requestPermission()
      if (p !== 'granted') return
    }
    const reg = await navigator.serviceWorker.ready
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(VAPID_PUBLIC) }))
    const j = sub.toJSON()
    if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) return
    await supabase
      .from('push_subscriptions')
      .upsert({ endpoint: j.endpoint, user_id: userId, p256dh: j.keys.p256dh, auth: j.keys.auth })
  } catch (e) {
    console.warn('push non attivato', e)
  }
}

/** Dopo che qualcuno segna "manca" un prodotto: avvisa gli admin (un solo riepilogo per gruppo). */
export async function notifyAdmins(groupId: string): Promise<void> {
  try {
    const { data: sess } = await supabase.auth.getSession()
    if (!sess.session) return
    await supabase.functions.invoke('send-push', {
      body: { group_id: groupId },
      headers: { Authorization: `Bearer ${sess.session.access_token}` },
    })
  } catch {
    /* le notifiche sono un di più: mai bloccare l'app */
  }
}
