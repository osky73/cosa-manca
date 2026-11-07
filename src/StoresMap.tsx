import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import OpeningHours from 'opening_hours'
import { useData } from './data'
import { IconX } from './icons'
import { logoUrl } from './lib'

interface Shop {
  id: string
  lat: number
  lon: number
  name: string
  logo: string | null // chiave del catalogo, se è una catena che conosciamo
  address: string
  hours: string | null
}

const MILAN: [number, number] = [45.4642, 9.19]
const RADIUS = 3000

// ---------- riconoscimento della catena dai dati di OpenStreetMap ----------

function chainOf(tags: Record<string, string>): string | null {
  const t = `${tags.brand ?? ''} ${tags.name ?? ''} ${tags.operator ?? ''}`.toLowerCase()
  const name = (tags.name ?? tags.brand ?? '').toLowerCase().trim()
  if (/esselunga/.test(t)) return 'esselunga'
  if (/\bcoop\b/.test(t)) return 'coop'
  if (/conad/.test(t)) return 'conad'
  if (/carrefour/.test(t)) return 'carrefour'
  if (/\blidl\b/.test(t)) return 'lidl'
  if (/eurospin/.test(t)) return 'eurospin'
  if (/\bpenny\b/.test(t)) return 'penny'
  if (/\baldi\b/.test(t)) return 'aldi'
  if (/\bpam\b|panorama/.test(t)) return 'pam'
  if (/^md\b/.test(name) || /^md$/.test((tags.brand ?? '').toLowerCase().trim())) return 'md'
  if (/^iper\b/.test(name) && !/iperal/.test(name)) return 'iper'
  return null
}

function addressOf(tags: Record<string, string>): string {
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ')
  return [street, tags['addr:city']].filter(Boolean).join(', ')
}

// Server pubblici di Overpass: si prova il successivo se uno non risponde o è sovraccarico.
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

function overpassQuery(lat: number, lon: number): string {
  const around = `(around:${RADIUS},${lat},${lon})`
  const kind = '["shop"~"^(supermarket|convenience|discount|department_store|variety_store)$"]'
  const names = 'Esselunga|Coop|Conad|Carrefour|Lidl|Eurospin|Penny|Aldi|Pam|Panorama'
  const short = '^(MD|Iper)([ ,]|$)'
  // Si cercano solo le catene dell'elenco: così in una grande città non si perdono per il limite dei risultati.
  return `[out:json][timeout:20];(
nwr${kind}["name"~"${names}",i]${around};
nwr${kind}["brand"~"${names}",i]${around};
nwr${kind}["name"~"${short}"]${around};
nwr${kind}["brand"~"${short}"]${around};
);out center tags 300;`
}

async function fetchShops(lat: number, lon: number, signal: AbortSignal): Promise<Shop[]> {
  const body = 'data=' + encodeURIComponent(overpassQuery(lat, lon))
  let last = 'nessuna risposta'
  for (const url of OVERPASS) {
    const ac = new AbortController()
    const onAbort = () => ac.abort()
    signal.addEventListener('abort', onAbort)
    const timer = window.setTimeout(() => ac.abort(), 22000)
    try {
      const res = await fetch(url, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: ac.signal,
      })
      if (!res.ok) {
        last = `errore ${res.status}`
        continue
      }
      const json = (await res.json()) as { elements?: OverpassElement[]; remark?: string }
      if (!json.elements) {
        last = json.remark ?? 'risposta vuota'
        continue
      }
      return toShops(json.elements)
    } catch (e) {
      if (signal.aborted) throw e
      last = (e as Error).name === 'AbortError' ? 'tempo scaduto' : 'connessione assente'
    } finally {
      window.clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
    }
  }
  throw new Error(last)
}

interface OverpassElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

function toShops(elements: OverpassElement[]): Shop[] {
  const out: Shop[] = []
  for (const e of elements) {
    const tags = e.tags ?? {}
    const la = e.lat ?? e.center?.lat
    const lo = e.lon ?? e.center?.lon
    if (la === undefined || lo === undefined) continue
    const logo = chainOf(tags)
    if (!logo) continue
    out.push({
      id: `${e.type}${e.id}`,
      lat: la,
      lon: lo,
      name: tags.name ?? tags.brand ?? 'Negozio',
      logo,
      address: addressOf(tags),
      hours: tags.opening_hours ?? null,
    })
  }
  return out
}

// ---------- orari ----------

const fmtTime = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })
const fmtDay = new Intl.DateTimeFormat('it-IT', { weekday: 'long' })

function when(d: Date, now: Date): string {
  const t = fmtTime.format(d)
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(d) - startOf(now)) / 86400000)
  if (days <= 0) return `alle ${t}`
  if (days === 1) return `domani alle ${t}`
  return `${fmtDay.format(d)} alle ${t}`
}

/** Frase sull'orario: «Aperto · chiude alle 20:30». Se non si può sapere, lo dice. */
export function hoursText(raw: string | null, now = new Date()): { text: string; open: boolean | null } {
  if (!raw) return { text: 'Orario non disponibile su OpenStreetMap', open: null }
  try {
    const oh = new OpeningHours(raw, { address: { country_code: 'it' } } as never)
    const open = oh.getState(now)
    const next = oh.getNextChange(now)
    if (open) {
      return { text: next ? `Aperto · chiude ${when(next, now)}` : 'Aperto sempre', open: true }
    }
    return { text: next ? `Chiuso · apre ${when(next, now)}` : 'Chiuso', open: false }
  } catch {
    return { text: `Orari: ${raw}`, open: null }
  }
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

function popupHtml(s: Shop): string {
  const h = hoursText(s.hours)
  const url = logoUrl(s.logo)
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const dir = isIOS
    ? `https://maps.apple.com/?daddr=${s.lat},${s.lon}`
    : `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`
  return `<div class="mp">
    <div class="mp-head">${url ? `<img src="${url}" width="40" height="40" alt="">` : ''}<strong>${esc(s.name)}</strong></div>
    <div class="mp-hours ${h.open === true ? 'ok' : h.open === false ? 'no' : ''}">${esc(h.text)}</div>
    ${s.address ? `<div class="mp-addr">${esc(s.address)}</div>` : ''}
    <a class="mp-dir" href="${dir}" target="_blank" rel="noopener">Indicazioni</a>
  </div>`
}

function markerIcon(s: Shop, mine: boolean): L.DivIcon {
  const url = logoUrl(s.logo)
  const html = url
    ? `<span class="pin ${mine ? 'mine' : ''}"><img src="${url}" alt=""></span>`
    : `<span class="pin generic"></span>`
  return L.divIcon({ className: 'pin-wrap', html, iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -22] })
}

// ---------- componente ----------

export default function StoresMap({ onClose }: { onClose: () => void }) {
  const d = useData()
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const abort = useRef<AbortController | null>(null)
  const [shops, setShops] = useState<Shop[]>([])
  const [onlyMine, setOnlyMine] = useState(true)
  const [status, setStatus] = useState<'locating' | 'loading' | 'ready' | 'error'>('locating')
  const [note, setNote] = useState('')
  const [locNote, setLocNote] = useState('')

  const mine = new Set(d.stores.map((s) => s.logo).filter(Boolean) as string[])

  async function load(lat: number, lon: number) {
    abort.current?.abort()
    const ac = new AbortController()
    abort.current = ac
    setStatus('loading')
    try {
      const list = await fetchShops(lat, lon, ac.signal)
      setShops(list)
      setStatus('ready')
      setNote(list.length === 0 ? 'Nessun negozio trovato in questa zona.' : '')
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setStatus('error')
      setNote(`Non riesco a caricare i negozi (${(e as Error).message}). Tocca «Cerca qui» per riprovare.`)
    }
  }

  // crea la mappa e chiede la posizione
  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView(MILAN, 14)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    map.current = m

    const fallback = () => {
      setLocNote('Non ho la tua posizione: sto mostrando Milano. Sposta la mappa e tocca «Cerca qui».')
      void load(MILAN[0], MILAN[1])
    }
    if (!navigator.geolocation) fallback()
    else
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const { latitude, longitude } = p.coords
          m.setView([latitude, longitude], 15)
          L.circleMarker([latitude, longitude], {
            radius: 8,
            color: '#fff',
            weight: 3,
            fillColor: '#1c7ed6',
            fillOpacity: 1,
          }).addTo(m)
          void load(latitude, longitude)
        },
        fallback,
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 },
      )

    return () => {
      abort.current?.abort()
      m.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ridisegna i segnaposto
  useEffect(() => {
    const g = layer.current
    if (!g) return
    g.clearLayers()
    for (const s of shops) {
      const isMine = s.logo !== null && mine.has(s.logo)
      if (onlyMine && !isMine) continue
      L.marker([s.lat, s.lon], { icon: markerIcon(s, isMine), title: s.name })
        .bindPopup(() => popupHtml(s), { closeButton: true, minWidth: 190 })
        .addTo(g)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shops, onlyMine, d.stores])

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    document.body.classList.add('noscroll')
    return () => {
      window.removeEventListener('keydown', k)
      document.body.classList.remove('noscroll')
    }
  }, [onClose])

  const visibleCount = shops.filter((s) => !onlyMine || (s.logo !== null && mine.has(s.logo))).length

  return (
    <div className="mapwrap" role="dialog" aria-modal="true" aria-label="Mappa dei negozi">
      <div ref={el} className="mapbox" />
      <div className="maptop">
        <button className="icon-btn mapclose" onClick={onClose} aria-label="Chiudi la mappa">
          <IconX />
        </button>
        <label className="maptoggle">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          <span>Solo i miei negozi</span>
        </label>
      </div>
      <div className="mapbottom">
        {status === 'locating' && <span>Cerco la tua posizione…</span>}
        {status === 'loading' && <span>Cerco i negozi…</span>}
        {status === 'ready' && !note && (
          <span>
            {visibleCount} {visibleCount === 1 ? 'negozio' : 'negozi'} in zona
            {onlyMine && shops.length > visibleCount ? ` · ${shops.length - visibleCount} altri nascosti` : ''}
          </span>
        )}
        {note ? <span>{note}</span> : status === 'ready' && locNote ? <span>{locNote}</span> : null}
        <button
          className="btn primary mapsearch"
          onClick={() => {
            const c = map.current?.getCenter()
            if (c) void load(c.lat, c.lng)
          }}
          disabled={status === 'loading' || status === 'locating'}
        >
          Cerca qui
        </button>
      </div>
    </div>
  )
}
