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
