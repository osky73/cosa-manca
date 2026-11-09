// Nell'anteprima la rete esterna è bloccata e la chiave Google vale solo per cosa-manca.it:
// qui c'è una finta «Google Maps» con le stesse chiamate che usa l'app (mappa trascinabile, segnaposto, ricerca di esempio).
/* eslint-disable @typescript-eslint/no-explicit-any */
class LL {
  constructor(
    private a: number,
    private o: number,
  ) {}
  lat() {
    return this.a
  }
  lng() {
    return this.o
  }
}

const PX_LAT = 11700 // pixel per grado di latitudine a zoom 14
const LON_K = 0.72

class FMap {
  box: HTMLDivElement
  layer: HTMLDivElement
  c = { lat: 45.4642, lng: 9.19 }
  z = 14
  ls: Record<string, Array<() => void>> = {}
  items = new Set<FMarker>()
  win: FInfo | null = null
  constructor(host: HTMLElement, o: any) {
    this.box = document.createElement('div')
    this.box.style.cssText =
      'position:absolute;inset:0;overflow:hidden;touch-action:none;background:#e9efe3;background-image:linear-gradient(#d6dfcf 1px,transparent 1px),linear-gradient(90deg,#d6dfcf 1px,transparent 1px);background-size:60px 60px;'
    this.layer = document.createElement('div')
    this.layer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%'
    this.box.appendChild(this.layer)
    const lbl = document.createElement('div')
    lbl.textContent = 'Anteprima: la mappa vera è Google Maps'
    lbl.style.cssText = 'position:absolute;right:8px;bottom:84px;font:11px system-ui;color:#6a7a6a;background:#ffffffcc;padding:2px 6px;border-radius:6px'
    this.box.appendChild(lbl)
    host.appendChild(this.box)
    if (o?.center) this.c = { ...o.center }
    if (o?.zoom) this.z = o.zoom
    let drag: { x: number; y: number } | null = null
    this.box.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY }
      this.box.setPointerCapture(e.pointerId)
    })
    this.box.addEventListener('pointermove', (e) => {
      if (!drag) return
      this.c = { lat: this.c.lat + (e.clientY - drag.y) / this.sy(), lng: this.c.lng - (e.clientX - drag.x) / this.sx() }
      drag = { x: e.clientX, y: e.clientY }
      this.place()
    })
    this.box.addEventListener('pointerup', () => {
      if (drag) {
        drag = null
        this.fire('idle')
      }
    })
    this.box.addEventListener('click', (e) => {
      if ((e.target as HTMLElement) === this.box) this.fire('click')
    })
    setTimeout(() => this.fire('idle'), 50)
  }
  sy() {
    return PX_LAT * 2 ** (this.z - 14)
  }
  sx() {
    return this.sy() * LON_K
  }
  proj(lat: number, lng: number) {
    const w = this.box.clientWidth || 390
    const h = this.box.clientHeight || 700
    return { x: w / 2 + (lng - this.c.lng) * this.sx(), y: h / 2 - (lat - this.c.lat) * this.sy() }
  }
  place() {
    this.items.forEach((m) => m.draw())
    this.win?.draw()
  }
  fire(n: string) {
    ;(this.ls[n] ?? []).forEach((f) => f())
  }
  addListener(n: string, f: () => void) {
    ;(this.ls[n] ||= []).push(f)
  }
  getCenter() {
    return new LL(this.c.lat, this.c.lng)
  }
  setCenter(p: { lat: number; lng: number }) {
    this.c = { ...p }
    this.place()
    this.fire('idle')
  }
  setZoom(z: number) {
    this.z = z
    this.place()
  }
  getBounds() {
    const w = (this.box.clientWidth || 390) / 2 / this.sx()
    const h = (this.box.clientHeight || 700) / 2 / this.sy()
    return { getNorthEast: () => new LL(this.c.lat + h, this.c.lng + w) }
  }
}

class FMarker {
  position: { lat: number; lng: number }
  content: HTMLElement
  title?: string
  private m: FMap | null = null
  private wrap = document.createElement('div')
  ls: Array<() => void> = []
  constructor(o: any) {
    this.position = o.position
    this.content = o.content
    this.title = o.title
    this.wrap.style.cssText = 'position:absolute;transform:translate(-50%,-50%);cursor:pointer'
    this.wrap.title = o.title ?? ''
    this.wrap.appendChild(this.content)
    this.wrap.addEventListener('click', (e) => {
      e.stopPropagation()
      this.ls.forEach((f) => f())
    })
    this.map = o.map ?? null
  }
  get map() {
    return this.m
  }
  set map(v: FMap | null) {
    this.m?.items.delete(this)
    this.wrap.remove()
    this.m = v
    if (v) {
      v.items.add(this)
      v.layer.appendChild(this.wrap)
      this.draw()
    }
  }
  draw() {
    if (!this.m) return
    const p = this.m.proj(this.position.lat, this.position.lng)
    this.wrap.style.left = `${p.x}px`
    this.wrap.style.top = `${p.y}px`
  }
  addListener(_n: string, f: () => void) {
    this.ls.push(f)
  }
}

class FInfo {
  private el = document.createElement('div')
  private m: FMap | null = null
  private a: FMarker | null = null
  constructor() {
    this.el.style.cssText =
      'position:absolute;transform:translate(-50%,-100%);margin-top:-30px;background:#fff;border-radius:12px;padding:12px 14px;box-shadow:0 4px 18px rgba(0,0,0,.35);z-index:5'
  }
  setContent(h: string) {
    this.el.innerHTML = h
  }
  open(o: { map: FMap; anchor: FMarker }) {
    this.close()
    this.m = o.map
    this.a = o.anchor
    o.map.win = this
    o.map.layer.appendChild(this.el)
    this.draw()
  }
  close() {
    this.el.remove()
    if (this.m) this.m.win = null
    this.m = null
  }
  draw() {
    if (!this.m || !this.a) return
    const p = this.m.proj(this.a.position.lat, this.a.position.lng)
    this.el.style.left = `${p.x}px`
    this.el.style.top = `${p.y}px`
  }
}

const OTHERS = ['Esselunga', 'Lidl', 'Carrefour Express', 'Conad', 'Supermercato Rossi', 'Alimentari Da Gino', 'Iperal']

class FPlace {
  id: string
  displayName: string
  location: LL
  formattedAddress: string
  regularOpeningHours: any = null
  constructor(id: string, name: string, lat: number, lng: number) {
    this.id = id
    this.displayName = name
    this.location = new LL(lat, lng)
    this.formattedAddress = `Via ${name.split(' ')[0]} ${10 + (id.length % 40)}, Milano`
  }
  async fetchFields() {
    this.regularOpeningHours = { weekdayDescriptions: ['lunedì: 08:00–20:30', 'martedì: 08:00–20:30', 'mercoledì: 08:00–20:30', 'giovedì: 08:00–20:30', 'venerdì: 08:00–20:30', 'sabato: 08:00–20:30', 'domenica: 09:00–13:00'] }
  }
  async isOpen() {
    return new Date().getDay() !== 0
  }
  static async searchByText(o: any) {
    const c = o.locationBias.center
    const names = String(o.textQuery).toLowerCase().includes('farmacia') || String(o.textQuery).toLowerCase().includes('edicola') ? [o.textQuery] : [o.textQuery, o.textQuery]
    return {
      places: names.map((n: string, i: number) => new FPlace(`${n}-${i}`, `${n}${i ? ' ' + (i + 1) : ''}`, c.lat + Math.sin(n.length + i * 2.1) * 0.012 * (1 + i), c.lng + Math.cos(n.length * 1.3 + i) * 0.016 * (1 + i))),
    }
  }
  static async searchNearby(o: any) {
    const c = o.locationRestriction.center
    return { places: OTHERS.map((n, i) => new FPlace(`n-${n}`, n, c.lat + Math.sin(i * 0.9) * 0.006 * (1 + (i % 3)), c.lng + Math.cos(i * 0.9) * 0.009 * (1 + (i % 3)))) }
  }
}

;(window as any).google = {
  maps: {
    marker: { AdvancedMarkerElement: FMarker },
    importLibrary: async (name: string) => {
      if (name === 'maps') return { Map: FMap, InfoWindow: FInfo }
      if (name === 'places') return { Place: FPlace }
      return { AdvancedMarkerElement: FMarker }
    },
  },
}
