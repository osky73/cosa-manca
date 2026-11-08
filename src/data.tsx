import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useToast } from './toast'
import { friendly, isNetworkError, readLS, writeLS } from './lib'
import type { Invitation, Item, Member, Need, Profile, Recurrence, Role, Store, Suggestion } from './types'

/** Operazioni sulle richieste "manca": accodate e inviate anche dopo, se manca la rete. */
type Op =
  | { k: 'add'; id: string; item_id: string; store_id: string | null; at: string }
  | { k: 'cancel'; id: string }
  | { k: 'store'; id: string; store_id: string | null }
  | { k: 'bought'; id: string }
  | { k: 'unbought'; id: string }

interface Snapshot {
  items: Item[]
  stores: Store[]
  needs: Need[]
  bought?: Need[]
  suggestions: Suggestion[]
  members: Member[]
  invitations: Invitation[]
}

const EMPTY: Snapshot = { items: [], stores: [], needs: [], bought: [], suggestions: [], members: [], invitations: [] }

export interface ProposeInput {
  name: string
  category: string
  recurrence: Recurrence
  note: string
  storeId: string | null
  markMissing: boolean
}

interface DataCtx {
  groupId: string
  userId: string
  isAdmin: boolean
  loaded: boolean
  online: boolean
  pendingOps: number
  items: Item[]
  stores: Store[]
  allStores: Store[]
  needs: Need[]
  suggestions: Suggestion[]
  members: Member[]
  invitations: Invitation[]
  needByItem: Map<string, Need>
  boughtNeeds: Need[]
  clearBought: () => Promise<void>
  clearAll: () => void
  itemOf: (id: string) => Item | undefined
  storeOf: (id: string | null) => Store | undefined
  nameOf: (userId: string | null) => string
  whoOf: (userId: string | null | undefined) => string | null
  toggleMissing: (item: Item) => void
  setNeedStore: (needId: string, storeId: string | null) => void
  markBought: (need: Need) => void
  propose: (p: ProposeInput) => Promise<'added' | 'pending'>
  decide: (id: string, approve: boolean, recurrence?: Recurrence) => Promise<void>
  addStore: (name: string, color: string, logo?: string | null, note?: string | null) => Promise<void>
  updateStore: (id: string, patch: { note?: string | null; active?: boolean }) => Promise<void>
  deleteStore: (id: string) => Promise<void>
  setItemHidden: (id: string, hidden: boolean) => Promise<void>
  archiveItem: (id: string) => Promise<void>
  restoreItem: (id: string) => Promise<void>
  moveItem: (id: string, category: string, orderedIds: string[]) => Promise<void>
  invite: (email: string, role: Role) => Promise<boolean>
  sendInviteEmail: (email: string) => Promise<boolean>
  removeInvitation: (id: string) => Promise<void>
  removeMember: (userId: string) => Promise<void>
  setMemberRole: (userId: string, role: Role) => Promise<void>
  leaveGroup: () => Promise<boolean>
  refetch: () => Promise<void>
}

const Ctx = createContext<DataCtx | null>(null)

export function useData(): DataCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useData fuori dal provider')
  return v
}

interface Props {
  groupId: string
  userId: string
  role: Role
  onLeft: () => void
  children: ReactNode
}

export function DataProvider({ groupId, userId, role, onLeft, children }: Props) {
  const toast = useToast()
  const snapKey = `cm.snap.${groupId}`
  const outKey = `cm.outbox.${groupId}`

  const [snap, setSnap] = useState<Snapshot>(() => readLS(snapKey, EMPTY))
  const [loaded, setLoaded] = useState(() => localStorage.getItem(snapKey) !== null)
  const [outbox, setOutboxState] = useState<Op[]>(() => readLS<Op[]>(outKey, []))
  const [online, setOnline] = useState(navigator.onLine)

  // Operazioni già inviate ma non ancora confermate da una lettura aggiornata: restano applicate per evitare
  // che una lettura "vecchia" faccia rimbalzare l'interfaccia (prodotto che sparisce, riappare e sparisce).
  const [settled, setSettled] = useState<Op[]>([])
  const settledRef = useRef<Op[]>([])
  const outboxRef = useRef<Op[]>(outbox)
  const needCache = useRef(new Map<string, Need>())
  const itemCache = useRef(new Map<string, Item>())
  const flushing = useRef(false)

  const setOutbox = useCallback(
    (fn: (o: Op[]) => Op[]) => {
      outboxRef.current = fn(outboxRef.current)
      setOutboxState(outboxRef.current)
      writeLS(outKey, outboxRef.current)
    },
    [outKey],
  )

  // ---------- Lettura ----------
  const refetch = useCallback(async () => {
    try {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      const [it, st, nd, sg, mb, bt] = await Promise.all([
        supabase.from('group_items').select('*').eq('group_id', groupId).eq('archived', false).order('sort').order('name'),
        supabase.from('stores').select('*').eq('group_id', groupId).order('sort').order('created_at'),
        supabase.from('needs').select('*').eq('group_id', groupId).eq('status', 'missing'),
        supabase
          .from('suggestions')
          .select('*')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false })
          .limit(60),
        supabase.from('memberships').select('user_id, role').eq('group_id', groupId),
        supabase.from('needs').select('*').eq('group_id', groupId).eq('status', 'bought').gte('bought_at', since),
      ])
      for (const r of [it, st, nd, sg, mb]) if (r.error) throw r.error

      const memberRows = (mb.data ?? []) as { user_id: string; role: Role }[]
      const pr = await supabase
        .from('profiles')
        .select('id, email, display_name')
        .in(
          'id',
          memberRows.map((m) => m.user_id),
        )
      const profiles = new Map(((pr.data ?? []) as Profile[]).map((p) => [p.id, p]))

      let invitations: Invitation[] = []
      if (role === 'admin') {
        const inv = await supabase.from('invitations').select('*').eq('group_id', groupId).order('created_at')
        if (!inv.error) invitations = inv.data as Invitation[]
      }

      const next: Snapshot = {
        items: it.data as Item[],
        stores: st.data as Store[],
        needs: nd.data as Need[],
        bought: (bt.data ?? []) as Need[],
        suggestions: sg.data as Suggestion[],
        members: memberRows.map((m) => ({ ...m, profile: profiles.get(m.user_id) ?? null })),
        invitations,
      }
      next.needs.forEach((n) => needCache.current.set(n.id, n))
      next.items.forEach((i) => itemCache.current.set(i.id, i))
      setSnap(next)
      writeLS(snapKey, next)
      setLoaded(true)
      setOnline(true)
    } catch (e) {
      console.warn('refetch fallito', e)
      setOnline(navigator.onLine)
    }
  }, [groupId, role, snapKey])

  // ---------- Invio operazioni ----------
  const execOp = useCallback(
    async (op: Op): Promise<'ok' | 'retry' | 'drop'> => {
      let error: { message: string; code?: string } | null = null
      try {
        if (op.k === 'add') {
          const r = await supabase
            .from('needs')
            .insert({ id: op.id, item_id: op.item_id, group_id: groupId, store_id: op.store_id })
          error = r.error
        } else if (op.k === 'cancel') {
          const r = await supabase.from('needs').delete().eq('id', op.id).eq('status', 'missing')
          error = r.error
        } else if (op.k === 'store') {
          const r = await supabase.from('needs').update({ store_id: op.store_id }).eq('id', op.id)
          error = r.error
        } else if (op.k === 'bought') {
          const r = await supabase.from('needs').update({ status: 'bought' }).eq('id', op.id).eq('status', 'missing')
          error = r.error
        } else {
          const r = await supabase.from('needs').update({ status: 'missing' }).eq('id', op.id).eq('status', 'bought')
          error = r.error
        }
      } catch (e) {
        error = { message: String(e) }
      }
      if (!error) return 'ok'
      if (isNetworkError(error.message)) return 'retry'
      if (error.code === '23505') return 'ok' // già in lista: qualcun altro l'aveva segnato
      toast.show(friendly(error.message))
      return 'drop'
    },
    [groupId, toast],
  )

  const flush = useCallback(async () => {
    if (flushing.current) return
    flushing.current = true
    try {
      while (outboxRef.current.length > 0) {
        const op = outboxRef.current[0]
        const res = await execOp(op)
        if (res === 'retry') {
          setOnline(false)
          break
        }
        settledRef.current = [...settledRef.current, op]
        setSettled(settledRef.current)
        setOutbox((o) => o.filter((x) => x !== op))
      }
    } finally {
      flushing.current = false
    }
    if (outboxRef.current.length === 0) {
      const n = settledRef.current.length
      await refetch()
      if (navigator.onLine) {
        settledRef.current = settledRef.current.slice(n)
        setSettled(settledRef.current)
      }
    }
  }, [execOp, refetch, setOutbox])

  /** Aggiunge un'operazione compattando quelle ridondanti. */
  const pushOp = useCallback(
    (op: Op) => {
      setOutbox((o) => {
        if (op.k === 'cancel' && o.some((x) => x.k === 'add' && x.id === op.id)) {
          return o.filter((x) => !('id' in x && x.id === op.id))
        }
        if (op.k === 'store') {
          const add = o.find((x) => x.k === 'add' && x.id === op.id)
          if (add && add.k === 'add') return o.map((x) => (x === add ? { ...add, store_id: op.store_id } : x))
          return [...o.filter((x) => !(x.k === 'store' && x.id === op.id)), op]
        }
        if (op.k === 'unbought' && o.some((x) => x.k === 'bought' && x.id === op.id)) {
          return o.filter((x) => !(x.k === 'bought' && x.id === op.id))
        }
        return [...o, op]
      })
      void flush()
    },
    [flush, setOutbox],
  )

  // ---------- Effetti: primo caricamento, realtime, rete ----------
  useEffect(() => {
    void flush()
    void refetch()
  }, [flush, refetch])

  useEffect(() => {
    let timer = 0
    const bump = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void refetch(), 250)
    }
    const ch = supabase.channel(`g-${groupId}`)
    for (const table of ['needs', 'group_items', 'stores', 'suggestions', 'memberships']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `group_id=eq.${groupId}` }, bump)
    }
    ch.subscribe()

    const onOnline = () => {
      setOnline(true)
      void flush()
    }
    const onOffline = () => setOnline(false)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void flush()
        void refetch()
      }
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisible)
    const retry = window.setInterval(() => {
      if (outboxRef.current.length > 0) void flush()
    }, 10000)

    return () => {
      window.clearTimeout(timer)
      window.clearInterval(retry)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(ch)
    }
  }, [groupId, flush, refetch])

  // ---------- Stato derivato (server + operazioni in coda) ----------
  const needs = useMemo(() => {
    const m = new Map(snap.needs.map((n) => [n.id, n]))
    for (const op of [...settled, ...outbox]) {
      switch (op.k) {
        case 'add': {
          const n: Need = {
            id: op.id,
            group_id: groupId,
            item_id: op.item_id,
            status: 'missing',
            store_id: op.store_id,
            note: null,
            requested_by: userId,
            requested_at: op.at,
          }
          needCache.current.set(op.id, n)
          m.set(op.id, n)
          break
        }
        case 'cancel':
        case 'bought':
          m.delete(op.id)
          break
        case 'store': {
          const n = m.get(op.id)
          if (n) {
            const upd = { ...n, store_id: op.store_id }
            needCache.current.set(op.id, upd)
            m.set(op.id, upd)
          }
          break
        }
        case 'unbought': {
          const n = needCache.current.get(op.id)
          if (n) m.set(op.id, { ...n, status: 'missing' })
          break
        }
      }
    }
    return [...m.values()]
  }, [snap.needs, settled, outbox, groupId, userId])

  const [cleared, setCleared] = useState<Set<string>>(new Set())
  const boughtNeeds = useMemo(() => {
    const m = new Map((snap.bought ?? []).map((n) => [n.id, n]))
    for (const op of [...settled, ...outbox]) {
      if (op.k === 'bought') {
        const n = needCache.current.get(op.id)
        if (n) m.set(op.id, { ...n, status: 'bought' })
      } else if (op.k === 'unbought') m.delete(op.id)
    }
    return [...m.values()].filter((n) => !cleared.has(n.id))
  }, [snap.bought, settled, outbox, cleared])

  const needByItem = useMemo(() => new Map(needs.map((n) => [n.item_id, n])), [needs])

  const itemOf = useCallback(
    (id: string) => snap.items.find((i) => i.id === id) ?? itemCache.current.get(id),
    [snap.items],
  )
  const activeStores = useMemo(() => snap.stores.filter((s) => s.active !== false), [snap.stores])
  const storeOf = useCallback(
    (id: string | null) => (id ? snap.stores.find((s) => s.id === id && s.active !== false) : undefined),
    [snap.stores],
  )
  const whoOf = useCallback(
    (uid: string | null | undefined) => {
      if (!uid) return null
      const p = snap.members.find((m) => m.user_id === uid)?.profile
      return p?.display_name || p?.email.split('@')[0] || null
    },
    [snap.members],
  )
  const nameOf = useCallback(
    (uid: string | null) => {
      if (!uid) return 'qualcuno'
      if (uid === userId) return 'te'
      const p = snap.members.find((m) => m.user_id === uid)?.profile
      return p?.display_name || p?.email.split('@')[0] || 'qualcuno'
    },
    [snap.members, userId],
  )

  // ---------- Azioni ----------
  const addNeed = useCallback(
    (itemId: string, storeId: string | null) => {
      pushOp({ k: 'add', id: crypto.randomUUID(), item_id: itemId, store_id: storeId, at: new Date().toISOString() })
    },
    [pushOp],
  )

  const toggleMissing = useCallback(
    (item: Item) => {
      const open = needByItem.get(item.id)
      if (open) {
        const prevStore = open.store_id
        pushOp({ k: 'cancel', id: open.id })
        toast.show(`«${item.name}» tolto dalla lista`, { label: 'Annulla', run: () => addNeed(item.id, prevStore) })
      } else {
        const was = boughtNeeds.find((n) => n.item_id === item.id)
        addNeed(item.id, was ? was.store_id : item.default_store_id)
      }
    },
    [needByItem, boughtNeeds, pushOp, addNeed, toast],
  )

  const setNeedStore = useCallback(
    (needId: string, storeId: string | null) => pushOp({ k: 'store', id: needId, store_id: storeId }),
    [pushOp],
  )

  const markBought = useCallback(
    (need: Need) => {
      pushOp({ k: 'bought', id: need.id })
    },
    [pushOp],
  )

  const clearBought = useCallback(async () => {
    const ids = boughtNeeds.map((n) => n.id)
    if (ids.length === 0) return
    setCleared((c) => new Set([...c, ...ids]))
    const { error } = await supabase.from('needs').delete().in('id', ids).eq('status', 'bought')
    if (error) {
      setCleared((c) => new Set([...c].filter((x) => !ids.includes(x))))
      toast.show(friendly(error.message))
      return
    }
    await refetch()
  }, [boughtNeeds, refetch, toast])

  const clearAll = useCallback(() => {
    const open = needs.map((n) => ({ id: n.id, item_id: n.item_id, store_id: n.store_id }))
    open.forEach((n) => pushOp({ k: 'cancel', id: n.id }))
    void clearBought()
    if (open.length > 0)
      toast.show('Lista azzerata', {
        label: 'Annulla',
        run: () => open.forEach((n) => addNeed(n.item_id, n.store_id)),
      })
  }, [needs, pushOp, clearBought, addNeed, toast])

  const act = useCallback(
    async (p: PromiseLike<{ error: { message: string } | null }>): Promise<boolean> => {
      const { error } = await p
      if (error) {
        toast.show(friendly(error.message))
        return false
      }
      await refetch()
      return true
    },
    [refetch, toast],
  )

  const propose = useCallback(
    async (p: ProposeInput) => {
      const { data, error } = await supabase.rpc('propose_item', {
        p_group: groupId,
        p_name: p.name,
        p_category: p.category,
        p_recurrence: p.recurrence,
        p_note: p.note || null,
        p_store: p.storeId,
        p_mark_missing: p.markMissing,
      })
      if (error) throw new Error(friendly(error.message))
      await refetch()
      return data as 'added' | 'pending'
    },
    [groupId, refetch],
  )

  const value: DataCtx = {
    groupId,
    userId,
    isAdmin: role === 'admin',
    loaded,
    online,
    pendingOps: outbox.length,
    items: snap.items,
    stores: activeStores,
    allStores: snap.stores,
    needs,
    suggestions: snap.suggestions,
    members: snap.members,
    invitations: snap.invitations,
    needByItem,
    boughtNeeds,
    clearBought,
    clearAll,
    itemOf,
    storeOf,
    nameOf,
    whoOf,
    toggleMissing,
    setNeedStore,
    markBought,
    propose,
    decide: async (id, approve, recurrence) => {
      await act(supabase.rpc('decide_suggestion', { p_id: id, p_approve: approve, p_recurrence: recurrence ?? null }))
    },
    addStore: async (name, color, logo = null, note = null) => {
      await act(
        supabase
          .from('stores')
          .insert({ group_id: groupId, name: name.trim(), color, logo, note, sort: snap.stores.length }),
      )
    },
    updateStore: async (id, patch) => {
      await act(supabase.from('stores').update(patch).eq('id', id))
    },
    deleteStore: async (id) => {
      await act(supabase.from('stores').delete().eq('id', id))
    },
    setItemHidden: async (id, hidden) => {
      await act(supabase.from('group_items').update({ hidden }).eq('id', id))
    },
    archiveItem: async (id) => {
      await act(supabase.from('group_items').update({ archived: true }).eq('id', id))
    },
    restoreItem: async (id) => {
      await act(supabase.from('group_items').update({ archived: false }).eq('id', id))
    },
    // Sposta un prodotto (anche in un'altra categoria) e salva l'ordine della categoria di arrivo.
    moveItem: async (id, category, orderedIds) => {
      const pos = new Map(orderedIds.map((x, i) => [x, i]))
      setSnap((s) => {
        const next = {
          ...s,
          items: s.items.map((i) =>
            pos.has(i.id) ? { ...i, sort: pos.get(i.id), category: i.id === id ? category : i.category } : i,
          ),
        }
        writeLS(snapKey, next)
        return next
      })
      const res = await Promise.all(
        orderedIds.map((x, i) =>
          supabase
            .from('group_items')
            .update(x === id ? { category, sort: i } : { sort: i })
            .eq('id', x),
        ),
      )
      const bad = res.find((r) => r.error)
      if (bad?.error) toast.show(friendly(bad.error.message))
      await refetch()
    },
    invite: async (email, inviteRole) =>
      act(
        supabase
          .from('invitations')
          .insert({ group_id: groupId, email: email.trim().toLowerCase(), role: inviteRole, invited_by: userId }),
      ),
    sendInviteEmail: async (email) => {
      const { data: sess } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('send-invite', {
        body: { group_id: groupId, email: email.trim().toLowerCase() },
        headers: sess.session ? { Authorization: `Bearer ${sess.session.access_token}` } : undefined,
      })
      return !error && Boolean((data as { ok?: boolean } | null)?.ok)
    },
    removeInvitation: async (id) => {
      await act(supabase.from('invitations').delete().eq('id', id))
    },
    removeMember: async (uid) => {
      await act(supabase.from('memberships').delete().eq('group_id', groupId).eq('user_id', uid))
    },
    setMemberRole: async (uid, r) => {
      await act(supabase.from('memberships').update({ role: r }).eq('group_id', groupId).eq('user_id', uid))
    },
    leaveGroup: async () => {
      const { error } = await supabase.from('memberships').delete().eq('group_id', groupId).eq('user_id', userId)
      if (error) {
        toast.show(friendly(error.message))
        return false
      }
      onLeft()
      return true
    },
    refetch,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
