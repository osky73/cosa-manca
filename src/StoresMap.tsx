import { useEffect, useRef, useState } from 'react'
import { useData } from './data'
import { supabase } from './supabase'
import { IconX } from './icons'
import { logoUrl, norm } from './lib'
import type { Store } from './types'

// contatore anonimo delle chiamate a Google (serve solo al super admin per tenere d'occhio la quota)
const logMap = (kind: 'load' | 'search' | 'details') => {
  void supabase.rpc('log_map', { p_kind: kind })
}

interface Shop {
  id: string
  lat: number
  lon: number
  name: string
  logo: string | null // chiave del catalogo, se è una catena che conosciamo
  mine: boolean // è uno dei negozi attivati nel Gruppo
  address: string
  place: google.maps.places.Place
}

const MILAN = { lat: 45.4642, lng: 9.19 }

// ---------- caricamento di Google Maps ----------

let loader: Promise<void> | null = null

const mapsReady = () =>
  typeof (window as { google?: typeof google }).google?.maps?.importLibrary === 'function'

function loadGoogle(): Promise<void> {
  if (mapsReady()) return Promise.resolve()
  if (loader) return loader
  const key = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined
  if (!key) return Promise.reject(new Error('chiave Google Maps mancante'))
  loader = new Promise<void>((resolve, reject) => {
    let done = false
    let script: HTMLScriptElement | null = null
    const fail = (msg: string) => {
      if (done) return
      done = true
      loader = null
      script?.remove()
      reject(new Error(msg))
    }
    const ok = () => {
      if (done) return
      done = true
      resolve()
    }
    // Google chiama questa funzione quando l'API è davvero pronta; in più controllo a intervalli.
    ;(window as unknown as Record<string, unknown>).__cmMapsReady = () => {
      if (mapsReady()) ok()
    }
    const started = Date.now()
    const tick = () => {
      if (done) return
      if (mapsReady()) return ok()
      if (Date.now() - started > 10000) return fail('Google Maps non risponde')
      setTimeout(tick, 150)
    }
    script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__cmMapsReady&language=it&region=IT`
    script.async = true
    script.onerror = () => fail('Google Maps non raggiungibile')
    document.head.appendChild(script)
    tick()
  })
  return loader
}

// ---------- riconoscimento della catena dal nome ----------

function chainOf(name: string): string | null {
  const t = name.toLowerCase().trim()
  if (/esselunga/.test(t)) return 'esselunga'
  if (/\bcoop\b/.test(t)) return 'coop'
  if (/conad/.test(t)) return 'conad'
  if (/carrefour/.test(t)) return 'carrefour'
  if (/\blidl\b/.test(t)) return 'lidl'
  if (/eurospin/.test(t)) return 'eurospin'
  if (/\bpenny\b/.test(t)) return 'penny'
  if (/\baldi\b/.test(t)) return 'aldi'
  if (/\bpam\b|panorama/.test(t)) return 'pam'
  if (/^md\b/.test(t)) return 'md'
  if (/^iper\b/.test(t) && !/iperal/.test(t)) return 'iper'
  return null
}

/** A quale negozio attivato corrisponde il nome? Per nome intero (così «Iper» non prende «Iperal»). */
function matchStore(name: string, stores: Store[]): Store | null {
  const text = norm(name)
  for (const st of stores) {
    const n = norm(st.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (n && new RegExp(`(^|[^a-z0-9])${n}([^a-z0-9]|$)`).test(text)) return st
  }
  return null
}

// ---------- ricerca dei negozi (Places API) ----------

const FIELDS = ['id', 'displayName', 'location', 'formattedAddress']

function distance(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000
  const r = (x: number) => (x * Math.PI) / 180
  const h =
    Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function toShop(p: google.maps.places.Place, stores: Store[], mine: Store | null): Shop | null {
  const loc = p.location
  const name = p.displayName
  if (!loc || !name || !p.id) return null
  const st = mine ?? matchStore(name, stores)
  return {
    id: p.id,
    lat: loc.lat(),
    lon: loc.lng(),
    name,
    logo: st ? (st.logo ?? chainOf(name)) : chainOf(name),
    mine: st !== null,
    address: p.formattedAddress ?? '',
    place: p,
  }
}

const cache = new Map<string, Shop[]>()

async function searchMine(lat: number, lng: number, radius: number, stores: Store[], signal: AbortSignal): Promise<Shop[]> {
  const { Place } = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary
  const bucket = (x: number) => x.toFixed(2)
  const rb = Math.round(radius / 1000)
  const perStore = await Promise.all(
    stores.slice(0, 10).map(async (st) => {
      const key = `m|${norm(st.name)}|${bucket(lat)}|${bucket(lng)}|${rb}`
      const hit = cache.get(key)
      if (hit) return hit
      try {
        logMap('search')
        const { places } = await Place.searchByText({
          textQuery: st.name,
          fields: FIELDS,
          locationBias: { center: { lat, lng }, radius: Math.min(50000, radius) },
          maxResultCount: 12,
          language: 'it',
          region: 'it',
        })
        const out: Shop[] = []
        for (const p of places) {
          const s = toShop(p, stores, null)
          if (!s) continue
          // il risultato deve davvero chiamarsi come il negozio cercato e stare in zona
          if (!matchStore(s.name, [st])) continue
          if (distance(lat, lng, s.lat, s.lon) > radius * 1.1) continue
          s.mine = true
          s.logo = st.logo ?? chainOf(s.name)
          out.push(s)
        }
        cache.set(key, out)
        return out
      } catch {
        return []
      }
    }),
  )
  if (signal.aborted) throw new DOMException('abort', 'AbortError')
  const seen = new Set<string>()
  return perStore.flat().filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
}

async function searchAll(lat: number, lng: number, radius: number, stores: Store[], signal: AbortSignal): Promise<Shop[]> {
  const { Place } = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary
  const key = `a|${lat.toFixed(2)}|${lng.toFixed(2)}|${Math.round(radius / 500)}`
  let found = cache.get(key)
  if (!found) {
    logMap('search')
    const { places } = await Place.searchNearby({
      fields: FIELDS,
      locationRestriction: { center: { lat, lng }, radius: Math.min(50000, radius) },
      includedPrimaryTypes: ['supermarket', 'grocery_store'],
      maxResultCount: 20,
      language: 'it',
      region: 'it',
    })
    found = places.map((p) => toShop(p, stores, null)).filter((s): s is Shop => s !== null)
    cache.set(key, found)
  }
  if (signal.aborted) throw new DOMException('abort', 'AbortError')
  // il segno «mio» va ricalcolato: i negozi attivati possono essere cambiati
  return found.map((s) => {
    const st = matchStore(s.name, stores)
    return { ...s, mine: st !== null, logo: st ? (st.logo ?? chainOf(s.name)) : chainOf(s.name) }
  })
}

// ---------- orari (solo quando si tocca un negozio) ----------

async function hoursInfo(p: google.maps.places.Place): Promise<{ text: string; open: boolean | null }> {
  try {
    logMap('details')
    // isOpen() ha bisogno anche del fuso orario del negozio
    await p.fetchFields({ fields: ['regularOpeningHours', 'utcOffsetMinutes'] })
  } catch (e) {
    console.warn('orari non letti', e)
    return { text: 'Orario non disponibile', open: null }
  }
  const h = p.regularOpeningHours
  if (!h) return { text: 'Orario non disponibile', open: null }
  let open: boolean | null = null
  try {
    open = (await p.isOpen()) ?? null
  } catch {
    open = null
  }
  const today = h.weekdayDescriptions?.[(new Date().getDay() + 6) % 7] ?? ''
  const hours = today.replace(/^[^:]+:\s*/, '')
  const state = open === null ? '' : open ? 'Aperto' : 'Chiuso'
  const text = [state, hours ? `oggi ${hours}` : ''].filter(Boolean).join(' · ')
  return { text: text || 'Orario non disponibile', open }
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

function popupHtml(s: Shop, h: { text: string; open: boolean | null } | null): string {
  const url = logoUrl(s.logo)
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const dir = isIOS
    ? `https://maps.apple.com/?daddr=${s.lat},${s.lon}`
    : `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}&destination_place_id=${encodeURIComponent(s.id)}`
  return `<div class="mp">
    <div class="mp-head">${url ? `<img src="${url}" width="40" height="40" alt="">` : ''}<strong>${esc(s.name)}</strong></div>
    <div class="mp-hours ${h?.open === true ? 'ok' : h?.open === false ? 'no' : ''}">${esc(h ? h.text : 'Cerco gli orari…')}</div>
    ${s.address ? `<div class="mp-addr">${esc(s.address)}</div>` : ''}
    <a class="mp-dir" href="${dir}" target="_blank" rel="noopener">Indicazioni</a>
  </div>`
}

function pinElement(s: Shop): HTMLElement {
  const url = logoUrl(s.logo)
  const el = document.createElement('span')
  el.className = url ? `pin ${s.mine ? 'mine' : ''}` : `pin generic ${s.mine ? 'mine' : ''}`
  if (url) {
    const img = document.createElement('img')
    img.src = url
    img.alt = ''
    el.appendChild(img)
  }
  return el
}

// ---------- componente ----------

export default function StoresMap({ onClose }: { onClose: () => void }) {
  const d = useData()
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<google.maps.Map | null>(null)
  const markers = useRef<google.maps.marker.AdvancedMarkerElement[]>([])
  const info = useRef<google.maps.InfoWindow | null>(null)
  const abort = useRef<AbortController | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const [shops, setShops] = useState<Shop[]>([])
  const [onlyMine, setOnlyMine] = useState(true)
  const onlyMineRef = useRef(true)
  onlyMineRef.current = onlyMine
  const [status, setStatus] = useState<'locating' | 'loading' | 'ready' | 'error'>('locating')
  const [note, setNote] = useState('')
  const [locNote, setLocNote] = useState('')

  // i negozi attivati nella scheda Negozi (anche senza prodotti associati)
  const stores = d.stores
  const storesRef = useRef(stores)
  storesRef.current = stores
  const storesKey = stores.map((x) => x.id + x.name).join('|')

  async function load() {
    const m = map.current
    if (!m) return
    const list = storesRef.current
    abort.current?.abort()
    const mineOnly = onlyMineRef.current
    if (mineOnly && list.length === 0) {
      setShops([])
      setStatus('ready')
      setNote('Non hai attivato nessun negozio: attivali nella scheda Negozi.')
      return
    }
    const c = m.getCenter()
    const b = m.getBounds()
    if (!c || !b) return
    const ne = b.getNorthEast()
    const radius = Math.max(1500, Math.min(mineOnly ? 30000 : 6000, Math.round(distance(c.lat(), c.lng(), ne.lat(), ne.lng()))))
    const ac = new AbortController()
    abort.current = ac
    setStatus('loading')
    try {
      const found = mineOnly
        ? await searchMine(c.lat(), c.lng(), radius, list, ac.signal)
        : await searchAll(c.lat(), c.lng(), radius, list, ac.signal)
      if (ac.signal.aborted) return
      setShops(found)
      setStatus('ready')
      setNote(found.length === 0 ? (mineOnly ? 'Nessuno dei tuoi negozi in questa zona. Sposta o riduci la mappa.' : 'Nessun supermercato in questa zona.') : '')
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setStatus('error')
      setNote(`Non riesco a caricare i negozi (${(e as Error).message}). Sposta la mappa per riprovare.`)
    }
  }
  // dopo ogni spostamento della mappa i negozi si aggiornano da soli
  const later = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void load(), 700)
  }

  // crea la mappa e chiede la posizione
  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        await loadGoogle()
        const { Map, InfoWindow } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary
        await google.maps.importLibrary('marker')
        logMap('load')
        if (dead || !el.current) return
        const m = new Map(el.current, {
          center: MILAN,
          zoom: 14,
          mapId: 'DEMO_MAP_ID',
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
        })
        map.current = m
        info.current = new InfoWindow({ maxWidth: 260 })
        m.addListener('idle', later)
        m.addListener('click', () => info.current?.close())

        const fallback = () => {
          setLocNote('Non ho la tua posizione: sto mostrando Milano. Sposta la mappa per cambiare zona.')
          later()
        }
        if (!navigator.geolocation) fallback()
        else
          navigator.geolocation.getCurrentPosition(
            (p) => {
              const pos = { lat: p.coords.latitude, lng: p.coords.longitude }
              m.setCenter(pos)
              m.setZoom(13)
              const dot = document.createElement('span')
              dot.className = 'me-dot'
              new google.maps.marker.AdvancedMarkerElement({ map: m, position: pos, content: dot, title: 'Tu sei qui' })
              later()
            },
            fallback,
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 },
          )
      } catch (e) {
        if (dead) return
        setStatus('error')
        setNote(`Non riesco a caricare la mappa (${(e as Error).message}).`)
      }
    })()
    return () => {
      dead = true
      window.clearTimeout(timer.current)
      abort.current?.abort()
      for (const mk of markers.current) mk.map = null
      markers.current = []
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // se cambiano i negozi attivi si rifà la ricerca
  useEffect(() => {
    if (map.current) later()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storesKey, onlyMine])

  // ridisegna i segnaposto
  useEffect(() => {
    const m = map.current
    if (!m) return
    for (const mk of markers.current) mk.map = null
    markers.current = shops.map((s) => {
      const mk = new google.maps.marker.AdvancedMarkerElement({
        map: m,
        position: { lat: s.lat, lng: s.lon },
        content: pinElement(s),
        title: s.name,
        zIndex: s.mine ? 2 : 1,
      })
      mk.addListener('click', () => {
        const w = info.current
        if (!w) return
        w.setContent(popupHtml(s, null))
        w.open({ map: m, anchor: mk })
        void hoursInfo(s.place).then((h) => w.setContent(popupHtml(s, h)))
      })
      return mk
    })
  }, [shops])

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    document.body.classList.add('noscroll')
    return () => {
      window.removeEventListener('keydown', k)
      document.body.classList.remove('noscroll')
    }
  }, [onClose])

  return (
    <div className="mapwrap" role="dialog" aria-modal="true" aria-label="Mappa dei negozi">
      <div ref={el} className="mapbox" />
      <div className="maptop">
        <button className="icon-btn mapclose" onClick={onClose} aria-label="Chiudi la mappa">
          <IconX />
        </button>
        <label className="maptoggle">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          <span>I tuoi negozi</span>
        </label>
        {status === 'ready' && !note && (
          <div className="mapcount" aria-label={`${shops.length} ${onlyMine ? 'tuoi negozi' : 'supermercati'} in zona`}>
            {shops.length}
          </div>
        )}
      </div>
      {(status !== 'ready' || note || locNote) && (
        <div className="mapbottom">
          {status === 'locating' && <span>Cerco la tua posizione…</span>}
          {status === 'loading' && <span>Cerco i negozi…</span>}
          {status === 'ready' && !note && locNote && <span>{locNote}</span>}
          {note && <span>{note}</span>}
        </div>
      )}
    </div>
  )
}
