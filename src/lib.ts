import type { Item } from './types'

export const CATEGORY_ORDER = [
  'Frigo',
  'Dispensa',
  'Frutta e verdura',
  'Bevande',
  'Surgelati',
  'Igiene e casa',
  'Altro',
]

export const STORE_COLORS = ['#2f7d4f', '#d9480f', '#1c7ed6', '#ae3ec9', '#e8a600', '#0b7285', '#c2255c', '#495057']

/** Prima lettera maiuscola (i nomi dei prodotti non devono essere tutti minuscoli). */
export function cap(s: string): string {
  const t = s.trim()
  return t ? t.charAt(0).toLocaleUpperCase('it') + t.slice(1) : t
}

export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function catRank(c: string): number {
  const i = CATEGORY_ORDER.indexOf(c)
  return i === -1 ? CATEGORY_ORDER.length - 1.5 : i
}

export function byCategoryThenName(a: { category: string; name: string }, b: { category: string; name: string }) {
  return catRank(a.category) - catRank(b.category) || a.name.localeCompare(b.name, 'it')
}

export function categoriesOf(items: Item[]): string[] {
  const set = new Set<string>(CATEGORY_ORDER)
  for (const i of items) set.add(i.category)
  return [...set].sort((a, b) => catRank(a) - catRank(b) || a.localeCompare(b, 'it'))
}

export function initials(name: string): string {
  const t = name.trim()
  return t ? t.slice(0, 1).toUpperCase() : '?'
}

export function friendly(message: string): string {
  if (/group_items_unique_name/.test(message)) return 'Esiste già un prodotto con questo nome.'
  if (/needs_one_open_per_item/.test(message)) return 'Questo prodotto è già in lista.'
  if (/ultimo amministratore|senza amministratore/i.test(message))
    return 'Il gruppo deve avere almeno un amministratore.'
  if (/row-level security/i.test(message)) return 'Non hai il permesso per farlo.'
  if (/invitations_group_id_email_key/.test(message)) return 'Questa email è già stata invitata.'
  return message
}

export function isNetworkError(message: string): boolean {
  return !navigator.onLine || /failed to fetch|network|load failed|fetch/i.test(message)
}

export function readLS<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota o modalità privata: ignora */
  }
}

// Supermercati con logo (file in public/stores/<logo>.svg). Il colore serve per i filtri e i segnaposto.
export const STORE_CATALOG: { logo: string; name: string; color: string }[] = [
  { logo: 'esselunga', name: 'Esselunga', color: '#d9480f' },
  { logo: 'coop', name: 'Coop', color: '#e03131' },
  { logo: 'conad', name: 'Conad', color: '#e8590c' },
  { logo: 'carrefour', name: 'Carrefour', color: '#1c7ed6' },
  { logo: 'lidl', name: 'Lidl', color: '#1971c2' },
  { logo: 'eurospin', name: 'Eurospin', color: '#2f7d4f' },
  { logo: 'md', name: 'MD', color: '#0b7285' },
  { logo: 'penny', name: 'Penny', color: '#c2255c' },
  { logo: 'aldi', name: 'Aldi', color: '#1864ab' },
  { logo: 'pam', name: 'Pam', color: '#e8a600' },
  { logo: 'iper', name: 'Iper', color: '#ae3ec9' },
]

export function logoUrl(logo: string | null | undefined): string | null {
  return logo && STORE_CATALOG.some((c) => c.logo === logo) ? `${import.meta.env.BASE_URL}stores/${logo}.svg` : null
}

// Sigla da mostrare nel badge colorato (al posto del logo): prime lettere delle prime due parole.
export function storeInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/**
 * Articolo determinativo per il nome di un prodotto («la mozzarella», «l'olio», «gli spinaci»).
 * Si deduce dalla desinenza del nome: se non si può capire, restituisce '' e la frase resta senza articolo.
 */
export function articleFor(name: string): string {
  const w = name.trim().toLowerCase().split(/\s+/)[0] ?? ''
  if (!w) return ''
  const vowel = /^[aeiouàèéìòù]/.test(w)
  const special = /^(s[^aeiouàèéìòù]|z|gn|ps|pn|x|y)/.test(w)
  const sing = { m: vowel ? "l'" : special ? 'lo ' : 'il ', f: vowel ? "l'" : 'la ' }
  const pl = { m: vowel || special ? 'gli ' : 'i ', f: 'le ' }

  const FEM_PL = new Set(['uova', 'noci', 'olive', 'arance'])
  const MASC_SING_E = new Set([
    'latte',
    'pane',
    'sale',
    'caffè',
    'sapone',
    'ammorbidente',
    'limone',
    'melone',
    'formaggio',
  ])
  const FEM_SING_E = new Set(['carne', 'pelle', 'chiave', 'crema'])

  if (FEM_PL.has(w)) return pl.f
  if (['yogurt', 'ketchup', 'caffè', 'tè'].includes(w)) return w === 'yogurt' || w === 'ketchup' ? sing.m : 'il '
  if (w.endsWith('a')) return sing.f
  if (w.endsWith('o')) return sing.m
  if (w.endsWith('i')) return pl.m
  if (w.endsWith('e')) {
    if (MASC_SING_E.has(w) || /(one|ente|ore)$/.test(w)) return sing.m
    if (FEM_SING_E.has(w) || /(zione|ice)$/.test(w)) return sing.f
    if (/(che|ghe|gne|lle|ate|ane|ele|ote|ine|ere|eze|ole|ive|nce|ure|se|ie)$/.test(w)) return pl.f
  }
  return ''
}
