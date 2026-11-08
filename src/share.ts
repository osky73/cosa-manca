import { norm } from './lib'
import { findItem } from './voice'
import type { Item } from './types'

/** Contenuto arrivato dal menu Condividi di Android (salvato dal service worker in una cache temporanea). */
export interface Shared {
  text: string
  images: Blob[]
}

const CACHE = 'cm-share'

/** Legge e svuota il contenuto condiviso. null = niente da leggere. */
export async function takeShared(): Promise<Shared | null> {
  try {
    const cache = await caches.open(CACHE)
    const meta = await cache.match('/__share/meta')
    if (!meta) return null
    const m = (await meta.json()) as { text: string; images: number }
    const images: Blob[] = []
    for (let i = 0; i < m.images; i++) {
      const r = await cache.match(`/__share/img${i}`)
      if (r) images.push(await r.blob())
    }
    for (const k of await cache.keys()) await cache.delete(k)
    return { text: m.text, images }
  } catch {
    return null
  }
}

// ---------- Lettura del contenuto ----------

/**
 * PUNTO DI INGRESSO SOSTITUIBILE: trasforma ciò che è stato condiviso in una lista di righe/articoli.
 * Oggi: testo ripulito + OCR nel telefono (Tesseract.js). In futuro si può sostituire con una funzione su Vercel
 * che usa un modello AI, senza toccare il resto (confronto con il catalogo e schermata di conferma).
 */
export async function leggiContenuto(s: Shared, onStatus?: (t: string) => void): Promise<string[]> {
  const parts: string[] = []
  if (s.text.trim()) parts.push(s.text)
  for (const img of s.images) {
    onStatus?.('Leggo la foto…')
    try {
      parts.push(await ocr(img))
    } catch (e) {
      console.warn('OCR fallito', e)
    }
  }
  return pulisciRighe(parts.join('\n'))
}

async function ocr(blob: Blob): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const w = await createWorker('ita')
  try {
    const { data } = await w.recognize(blob)
    return data.text
  } finally {
    await w.terminate()
  }
}

const WA_PREFIX = [
  /^\[?\d{1,2}[/.]\d{1,2}[/.]\d{2,4},?\s+\d{1,2}[:.]\d{2}(?::\d{2})?\]?\s*-?\s*[^:]{1,30}:\s*/,
  /^\[\d{1,2}[:.]\d{2}[^\]]*\]\s*[^:]{1,30}:\s*/,
]
const GREETING =
  /^(ciao|ciaooo*|buongiorno|buonasera|buon pomeriggio|salve|hey|ehi|grazie|grazie mille|ok|okay|perfetto|va bene|a dopo|a presto|baci|bacio|scusa|scusami|per favore|per piacere)\W*$/
const GREET_PREFIX = /^(ciao|ciaooo*|buongiorno|buonasera|salve|hey|ehi|scusa|scusami)\W+/
const POLITE =
  /^(mi prendi anche|mi prendi|mi compri|puoi prendere anche|puoi prendere|prendi anche|prendi|ricordati di prendere|ricordati|ci serve anche|ci serve|ci servono|servono|serve|manca anche|mancano|manca|anche|poi|ah|e)\s+/
const ARTICLE = /^(il|lo|la|i|gli|le|un|una|uno|del|della|dei|delle|dello|degli)\s+|^(l|un|dell)'\s*/

/** Divide per righe, virgole e punti elenco; toglie numeri e simboli iniziali, saluti, orari e righe che non sono prodotti. */
export function pulisciRighe(text: string): string[] {
  const out: string[] = []
  for (let line of text.split(/\r?\n/)) {
    for (const re of WA_PREFIX) line = line.replace(re, '')
    for (let piece of line.split(/[,;•·▪◦]| - |\s{3,}/)) {
      piece = piece.toLowerCase().trim()
      piece = piece.replace(/^[\s\-–—•·*▪◦>#]+/, '').replace(/^\d+\s*[.)\]:-]\s+/, '')
      piece = piece.replace(/^\d+\s*(x|pz|pezzi|conf|confezioni)?\s+(?=[a-zà-ù])/, '')
      for (let i = 0; i < 3; i++) piece = piece.replace(GREET_PREFIX, '').replace(POLITE, '')
      piece = piece.replace(ARTICLE, '')
      piece = piece.replace(/\s*(x\s*\d+|\(\d+\)|\d+\s*(pz|pezzi|conf))\s*$/, '')
      piece = piece.replace(/\s*(per favore|per piacere|grazie|grazie mille)\W*$/, '')
      piece = piece
        .replace(/[\s.:;!?]+$/, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (piece.length < 2 || piece.length > 40) continue
      if (!/[a-zà-ù]{2}/.test(piece)) continue
      if (/\b\d{1,2}[:.]\d{2}\b/.test(piece)) continue // orari
      if (GREETING.test(piece) || /^(anche|poi|ah|e|per)$/.test(piece)) continue
      if (!out.includes(piece)) out.push(piece)
    }
  }
  return out
}

// ---------- Confronto con il catalogo ----------

export interface Matched {
  line: string
  item: Item | null // null = non riconosciuto
}

const compact = (s: string) => norm(s).replace(/[^a-z0-9]/g, '')

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

/** Prodotto più simile con soglia prudente: nel dubbio «non riconosciuto». */
export function matchItem(line: string, items: Item[]): Item | null {
  const exact = findItem(line, items)
  if (exact) return exact
  const q = compact(line)
  if (q.length < 3) return null
  let best: Item | null = null
  let bestSim = 0
  for (const it of items) {
    const c = compact(it.name)
    if (c.length < 3) continue
    const sim = 1 - lev(q, c) / Math.max(q.length, c.length)
    const ok = sim >= 0.8 || (sim >= 0.75 && q.length === c.length && q.length >= 4 && q[0] === c[0])
    if (ok && sim > bestSim) {
      best = it
      bestSim = sim
    }
  }
  return best
}

/** Divide le righe in riconosciute/non riconosciute. Le frasi lunghe (>3 parole) non riconosciute sono scartate. */
export function classifica(lines: string[], items: Item[]): { matched: Matched[]; dropped: number } {
  const matched: Matched[] = []
  let dropped = 0
  const seen = new Set<string>()
  for (const line of lines) {
    const item = matchItem(line, items)
    if (item) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      matched.push({ line, item })
    } else if (line.split(' ').length > 3) dropped++
    else matched.push({ line, item: null })
  }
  return { matched, dropped }
}
