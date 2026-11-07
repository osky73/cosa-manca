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
  if (/ultimo amministratore|senza amministratore/i.test(message)) return 'Il gruppo deve avere almeno un amministratore.'
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
