// Finto "supabase" per la demo interattiva: stessi metodi usati dall'app, ma i dati stanno in memoria.
import { seed } from './seed'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const db: Record<string, Row[]> = seed()
export const demo = { role: 'admin' as 'admin' | 'member' }
export const configured = true

const uid = () => crypto.randomUUID()
const wait = () => new Promise((r) => setTimeout(r, 60))
const cmp = (a: unknown, b: unknown) =>
  typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b, 'it') : a === b ? 0 : (a as number) < (b as number) ? -1 : 1

class Q implements PromiseLike<{ data: any; error: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: Row | Row[] = {}
  private filters: ((r: Row) => boolean)[] = []
  private orders: [string, boolean][] = []
  private lim = Infinity
  private one = false
  constructor(private table: string) {}
  select() { return this }
  insert(p: Row | Row[]) { this.op = 'insert'; this.payload = p; return this }
  update(p: Row) { this.op = 'update'; this.payload = p; return this }
  delete() { this.op = 'delete'; return this }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this }
  in(c: string, v: unknown[]) { this.filters.push((r) => v.includes(r[c])); return this }
  gte(c: string, v: string) { this.filters.push((r) => r[c] != null && String(r[c]) >= v); return this }
  order(c: string, o?: { ascending?: boolean }) { this.orders.push([c, o?.ascending !== false]); return this }
  limit(n: number) { this.lim = n; return this }
  maybeSingle() { this.one = true; return this }
  single() { this.one = true; return this }
  then<T1, T2>(ok?: (v: { data: any; error: any }) => T1 | PromiseLike<T1>, ko?: (e: unknown) => T2 | PromiseLike<T2>) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return this.run().then(ok, ko)
  }
  private async run() {
    await wait()
    const rows = (db[this.table] ??= [])
    const match = (r: Row) => this.filters.every((f) => f(r))
    if (this.op === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload]
      for (const p of list) {
        const r: Row = { id: uid(), created_at: new Date().toISOString(), ...p }
        if (this.table === 'needs') {
          if (rows.some((x) => x.item_id === r.item_id && x.status === 'missing')) {
            return { data: null, error: { message: 'duplicate key value', code: '23505' } }
          }
          Object.assign(r, { status: 'missing', requested_by: 'u1', requested_at: new Date().toISOString(), ...p, id: p.id ?? r.id })
        }
        if (this.table === 'stores') Object.assign(r, { active: true, ...p })
        rows.push(r)
      }
      return { data: null, error: null }
    }
    if (this.op === 'update') {
      for (const r of rows.filter(match)) {
        Object.assign(r, this.payload)
        if (this.table === 'needs' && (this.payload as Row).status === 'bought') {
          Object.assign(r, { bought_at: new Date().toISOString(), bought_by: 'u1' })
        }
      }
      return { data: null, error: null }
    }
    if (this.op === 'delete') {
      db[this.table] = rows.filter((r) => !match(r))
      return { data: null, error: null }
    }
    let out = rows.filter(match).map((r) => ({ ...r }))
    for (const [c, asc] of [...this.orders].reverse()) out.sort((a, b) => (asc ? 1 : -1) * cmp(a[c], b[c]))
    out = out.slice(0, this.lim)
    return { data: this.one ? (out[0] ?? null) : out, error: null }
  }
}

const rpc = async (name: string, a: Row = {}) => {
  await wait()
  if (name === 'propose_item') {
    const items = db.group_items
    if (demo.role === 'admin') {
      const sort = Math.max(-1, ...items.filter((i) => i.category === a.p_category && !i.archived).map((i) => i.sort ?? 0)) + 1
      const id = uid()
      items.push({ id, group_id: 'g1', name: a.p_name, category: a.p_category, recurrence: a.p_recurrence, hidden: false,
        archived: false, default_store_id: null, sort, created_by: 'u1' })
      if (a.p_mark_missing || a.p_recurrence === 'one_off') {
        db.needs.push({ id: uid(), group_id: 'g1', item_id: id, status: 'missing', store_id: a.p_store ?? null, note: a.p_note ?? null,
          requested_by: 'u1', requested_at: new Date().toISOString() })
      }
      return { data: 'added', error: null }
    }
    db.suggestions.unshift({ id: uid(), group_id: 'g1', name: a.p_name, category: a.p_category, recurrence: a.p_recurrence,
      note: a.p_note ?? null, store_id: a.p_store ?? null, suggested_by: 'u2', status: 'pending', created_at: new Date().toISOString() })
    return { data: 'pending', error: null }
  }
  if (name === 'propose_store') {
    if (demo.role === 'admin') {
      db.stores.push({ id: uid(), group_id: 'g1', name: a.p_name, color: a.p_color, logo: null, note: null, sort: db.stores.length, active: true })
      return { data: 'added', error: null }
    }
    db.suggestions.unshift({ id: uid(), group_id: 'g1', name: a.p_name, category: 'Negozio', recurrence: 'recurring', kind: 'store',
      color: a.p_color, note: null, store_id: null, suggested_by: 'u2', status: 'pending', created_at: new Date().toISOString() })
    return { data: 'pending', error: null }
  }
  if (name === 'decide_suggestion') {
    const s = db.suggestions.find((x) => x.id === a.p_id)
    if (s && s.status === 'pending' && s.kind === 'store') {
      if (a.p_approve) db.stores.push({ id: uid(), group_id: 'g1', name: s.name, color: s.color, logo: null, note: null, sort: db.stores.length, active: true })
      s.status = a.p_approve ? 'approved' : 'rejected'
      return { data: null, error: null }
    }
    if (s && s.status === 'pending') {
      if (a.p_approve) {
        const id = uid()
        const rec = a.p_recurrence ?? s.recurrence
        const sort = Math.max(-1, ...db.group_items.filter((i) => i.category === s.category).map((i) => i.sort ?? 0)) + 1
        db.group_items.push({ id, group_id: 'g1', name: s.name, category: s.category, recurrence: rec, hidden: false,
          archived: false, default_store_id: null, sort, created_by: s.suggested_by })
        db.needs.push({ id: uid(), group_id: 'g1', item_id: id, status: 'missing', store_id: s.store_id, note: s.note,
          requested_by: s.suggested_by, requested_at: new Date().toISOString() })
        s.status = 'approved'
      } else s.status = 'rejected'
    }
    return { data: null, error: null }
  }
  if (name === 'log_map') return { data: null, error: null }
  if (name === 'admin_stats')
    return {
      data: { users_total: 38, users_30d: 24, users_7d_new: 5, groups_total: 17, groups_active_30d: 12, needs_total: 842, db_bytes: 31457280, map_load: 312, map_search: 1240, map_details: 860 },
      error: null,
    }
  if (name === 'is_super_admin') return { data: true, error: null }
  if (name === 'list_feedback')
    return {
      data: [
        { id: 'f1', kind: 'idea', body: 'Sarebbe bello poter aggiungere una foto al prodotto.', created_at: '2026-11-07T18:20:00Z', display_name: 'Giulia', email: 'giulia@example.com', group_name: 'Casa Rossi' },
        { id: 'f2', kind: 'wish', body: 'Il mare d\'inverno', created_at: '2026-11-06T09:05:00Z', display_name: 'Marco', email: 'marco@example.com', group_name: 'Casa Bianchi' },
      ],
      error: null,
    }
  return { data: null, error: null }
}

const channel = { on() { return channel }, subscribe() { return channel } }

export const supabase = {
  from: (t: string) => new Q(t),
  rpc,
  channel: () => channel,
  removeChannel: async () => 'ok',
  auth: {
    getSession: async () => ({ data: { session: { access_token: 'demo', user: { id: 'u1' } } }, error: null }),
    getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  functions: {
    invoke: async (n: string) =>
      n === 'admin-usage'
        ? { data: { resend: { month: 214, today: 3 }, vercel: { deploys_month: 41 }, supabase: null }, error: null }
        : { data: { ok: true }, error: null },
  },
}
