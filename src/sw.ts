/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>
}

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

// Condividi con Cosa manca (Android): riceve il POST, salva testo e immagini in una cache temporanea e apre l'app.
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'POST' || new URL(req.url).pathname !== '/share-target') return
  event.respondWith(
    (async () => {
      try {
        const form = await req.formData()
        const text = [form.get('title'), form.get('text'), form.get('url')]
          .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
          .join('\n')
        const files = form.getAll('files').filter((f): f is File => f instanceof File && f.type.startsWith('image/'))
        const cache = await caches.open('cm-share')
        for (const k of await cache.keys()) await cache.delete(k)
        for (let i = 0; i < files.length; i++)
          await cache.put(`/__share/img${i}`, new Response(files[i], { headers: { 'Content-Type': files[i].type } }))
        await cache.put(
          '/__share/meta',
          new Response(JSON.stringify({ text, images: files.length }), {
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      } catch {
        /* se qualcosa va storto si apre comunque l'app */
      }
      return Response.redirect('/?condiviso=1', 303)
    })(),
  )
})

// Notifiche riepilogative per gli amministratori: una sola notifica per gruppo, che si aggiorna.
self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; tag?: string } = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Cosa manca', {
      body: data.body || 'Ci sono novità nella lista.',
      tag: data.tag || 'cosa-manca',
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = all[0]
      if (open) await open.focus()
      else await self.clients.openWindow('/')
    })(),
  )
})
