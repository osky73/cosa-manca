import { norm } from './lib'
import type { Item, Store } from './types'

/** Un comando parlato già interpretato: un prodotto (del catalogo o nuovo) ed eventualmente un negozio. */
export interface VoiceCmd {
  name: string // come l'ha detto la persona, ripulito
  item: Item | null // prodotto del catalogo, se riconosciuto
  store: Store | null // negozio nominato
}

const STORE_PREP = '(?:da|dal|dalla|dallo|dai|dagli|al|alla|allo|all|ai|agli|in|presso|nel|nella|su|sul|sulla|a)'
const VERBS = [
  'ci manca',
  'ci mancano',
  'manca',
  'mancano',
  'ci serve',
  'ci servono',
  'mi serve',
  'mi servono',
  'serve',
  'servono',
  'devo prendere',
  'dobbiamo prendere',
  'ho bisogno di',
  'abbiamo bisogno di',
  'prendi',
  'prendimi',
  'prendere',
  'aggiungi',
  'aggiungere',
  'metti',
  'mettere',
  'segna',
  'segnare',
  'compra',
  'comprami',
  'comprare',
  'e finito',
  'e finita',
  'sono finiti',
  'sono finite',
  'finito',
  'finita',
  'finiti',
  'finite',
  'alla lista',
  'nella lista',
  'in lista',
  'alla spesa',
  'per favore',
  'per piacere',
  'per cortesia',
]
const FILLER = [
  'il',
  'lo',
  'la',
  'i',
  'gli',
  'le',
  'l',
  'un',
  'uno',
  'una',
  'un po di',
  'po di',
  'del',
  'dello',
  'della',
  'dei',
  'degli',
  'delle',
  'dell',
  'di',
  'd',
  'questo',
  'questa',
  'prodotto',
]

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const clean = (s: string) =>
  norm(s)
    .replace(/['’`]/g, ' ')
    .replace(/[^a-z0-9_ ,;]/g, ' ')
    .replace(/ +/g, ' ')
    .trim()
const stem = (w: string) => (w.length > 3 ? w.replace(/[aeio]$/, '') : w)
const words = (s: string) => clean(s).replace(/[,;]/g, ' ').split(' ').filter(Boolean).map(stem)

function stripWords(text: string, list: string[]): string {
  let t = ` ${text} `
  for (const w of [...list].sort((a, b) => b.length - a.length)) t = t.replace(new RegExp(` ${esc(w)}(?= )`, 'g'), ' ')
  return t.replace(/ +/g, ' ').trim()
}

export function findItem(name: string, items: Item[]): Item | null {
  const q = words(name)
  if (q.length === 0) return null
  let best: Item | null = null
  let bestScore = 0
  for (const it of items) {
    const w = words(it.name)
    if (w.length === 0) continue
    let score = 0
    if (w.join(' ') === q.join(' ')) score = 3
    else if (q.every((x) => w.includes(x))) score = 2
    else if (w.every((x) => q.includes(x))) score = 1.5
    if (score > bestScore || (score === bestScore && score > 0 && best && it.name.length < best.name.length)) {
      best = it
      bestScore = score
    }
  }
  return best
}

function findStore(seg: string, stores: Store[]): { store: Store; rest: string } | null {
  const byLen = [...stores].sort((a, b) => b.name.length - a.name.length)
  for (const s of byLen) {
    const full = clean(s.name)
    const bare = full.replace(/^(?:il|lo|la|l|i|le|gli) /, '')
    const first = bare.split(' ')[0]
    for (const key of [full, bare, first.length >= 4 ? first : '']) {
      if (!key) continue
      const m = new RegExp(`(?:^| )(?:${STORE_PREP} )?${esc(key)}(?= |$)`).exec(` ${seg}`.trim() === seg ? seg : seg)
      if (m)
        return {
          store: s,
          rest: (seg.slice(0, m.index) + ' ' + seg.slice(m.index + m[0].length)).replace(/ +/g, ' ').trim(),
        }
    }
  }
  return null
}

/** Interpreta una frase tipo «manca il latte e il pane, prendi la pasta all'Esselunga». */
export function parseVoice(text: string, items: Item[], stores: Store[]): VoiceCmd[] {
  let t = clean(text)
  // I nomi con «e» dentro (es. «frutta e verdura») non vanno spezzati.
  const protectedNames = items.map((i) => clean(i.name)).filter((n) => n.includes(' e '))
  for (const n of protectedNames) t = t.split(n).join(n.replace(/ /g, '_'))
  const parts = t
    .split(/ *[,;] *| e poi | e | poi | piu /)
    .map((p) => p.trim())
    .filter(Boolean)
  const out: VoiceCmd[] = []
  const found = parts.map((p) => findStore(p, stores))
  // Un solo negozio detto alla fine: vale per tutti i prodotti della frase.
  const last = found[found.length - 1]
  const shared = last && found.filter(Boolean).length === 1 ? last.store : null
  parts.forEach((p, i) => {
    const f = found[i]
    const rest = (f ? f.rest : p).replace(/_/g, ' ')
    const name = stripWords(stripWords(rest, VERBS), FILLER)
    if (!name) return
    out.push({ name, item: findItem(name, items), store: f?.store ?? shared })
  })
  return out
}

// ---------- Riconoscimento vocale del browser ----------
type Rec = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

export function dictationSupported(): boolean {
  const w = window as unknown as Record<string, unknown>
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export function startDictation(h: {
  onText: (t: string) => void
  onEnd: (finalText: string, error: string | null) => void
}): () => void {
  const w = window as unknown as Record<string, new () => Rec>
  const R = w.SpeechRecognition || w.webkitSpeechRecognition
  const r = new R()
  r.lang = 'it-IT'
  r.interimResults = true
  r.continuous = false
  let text = ''
  let err: string | null = null
  r.onresult = (e) => {
    text = Array.from(e.results)
      .map((x) => x[0].transcript)
      .join(' ')
    h.onText(text)
  }
  r.onerror = (e) => {
    err = e.error
  }
  r.onend = () => h.onEnd(text.trim(), err)
  r.start()
  return () => r.stop()
}
