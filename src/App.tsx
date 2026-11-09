import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configured, supabase } from './supabase'
import { ToastProvider } from './toast'
import { DataProvider, useData } from './data'
import { readLS, writeLS } from './lib'
import { IconBook, IconCart, IconInbox, IconList, IconStore, IconUsers } from './icons'
import { InstallPopup } from './install'
import Login from './screens/Login'
import Onboarding from './screens/Onboarding'
import ListScreen from './screens/ListScreen'
import ShopScreen from './screens/ShopScreen'
import StoresScreen from './screens/StoresScreen'
import IdeasScreen from './screens/IdeasScreen'
import GroupScreen from './screens/GroupScreen'
import ShareScreen from './screens/ShareScreen'
import GuideScreen from './screens/GuideScreen'
import Spotlight from './Spotlight'
import { TOURS, type Tour } from './tours'
import type { GroupRef, Profile, Role, Tab } from './types'

// Aperta dal menu Condividi di Android? (il service worker rimanda a /?condiviso=1)
const OPENED_BY_SHARE = new URLSearchParams(location.search).has('condiviso')

interface Boot {
  profile: Profile | null
  groups: GroupRef[]
}

export default function App() {
  if (!configured) return <ConfigMissing />
  return (
    <ToastProvider>
      <Root />
    </ToastProvider>
  )
}

function ConfigMissing() {
  return (
    <main className="auth">
      <div className="card">
        <h1>Configurazione mancante</h1>
        <p>
          Mancano le variabili <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code>. Impostale su Vercel
          (Settings → Environment Variables) e rifai il deploy.
        </p>
      </div>
    </main>
  )
}

// codice di chi ha condiviso il link (?r=…): si conserva fino al primo accesso
try {
  const r = new URLSearchParams(window.location.search).get('r')
  if (r && /^[0-9a-f-]{36}$/i.test(r)) {
    localStorage.setItem('cm_ref', r)
    const u = new URL(window.location.href)
    u.searchParams.delete('r')
    window.history.replaceState(null, '', u.pathname + u.search + u.hash)
  }
} catch {
  /* ignora */
}

function Root() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    if (!session) return
    let ref: string | null = null
    try {
      ref = localStorage.getItem('cm_ref')
    } catch {
      /* ignora */
    }
    if (!ref) return
    void supabase.rpc('claim_referral', { p_ref: ref }).then(({ error }) => {
      if (error) return
      try {
        localStorage.removeItem('cm_ref')
      } catch {
        /* ignora */
      }
    })
  }, [session])

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <Splash />
  if (!session) return <Login />
  return <Authed key={session.user.id} userId={session.user.id} />
}

function Splash() {
  return (
    <main className="auth">
      <div className="brand">
        <img src="/pwa-192.png" width="72" height="72" alt="" />
        <p>Carico…</p>
      </div>
    </main>
  )
}

function Authed({ userId }: { userId: string }) {
  const bootKey = `cm.boot.${userId}`
  const [boot, setBoot] = useState<Boot | null>(() => readLS<Boot | null>(bootKey, null))
  const [groupId, setGroupId] = useState<string | null>(() => localStorage.getItem('cm.group'))
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    try {
      await supabase.rpc('accept_my_invitations')
      const [pr, ms] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, email, display_name, marketing_opt_in, notify_new')
          .eq('id', userId)
          .maybeSingle(),
        supabase.from('memberships').select('role, groups(id, name)').eq('user_id', userId),
      ])
      if (pr.error) throw pr.error
      if (ms.error) throw ms.error
      type G = { id: string; name: string }
      type Row = { role: Role; groups: G | G[] | null }
      const groups: GroupRef[] = ((ms.data ?? []) as unknown as Row[]).flatMap((r) => {
        const g = Array.isArray(r.groups) ? r.groups[0] : r.groups
        return g ? [{ id: g.id, name: g.name, role: r.role }] : []
      })
      const next: Boot = { profile: (pr.data as Profile | null) ?? null, groups }
      setBoot(next)
      writeLS(bootKey, next)
      setFailed(false)
    } catch (e) {
      console.warn('boot fallito', e)
      if (!boot) setFailed(true)
    }
  }, [userId, bootKey, boot])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  if (!boot) {
    return failed ? (
      <main className="auth">
        <div className="card">
          <p>Non riesco a collegarmi. Controlla la connessione.</p>
          <button className="btn primary" onClick={() => void load()}>
            Riprova
          </button>
        </div>
      </main>
    ) : (
      <Splash />
    )
  }

  const needName = !boot.profile?.display_name
  if (needName || boot.groups.length === 0) {
    return (
      <Onboarding userId={userId} profile={boot.profile} hasGroup={boot.groups.length > 0} onDone={() => void load()} />
    )
  }

  const current = boot.groups.find((g) => g.id === groupId) ?? boot.groups[0]

  return (
    <DataProvider
      key={current.id}
      groupId={current.id}
      userId={userId}
      role={current.role}
      onLeft={() => {
        localStorage.removeItem('cm.group')
        setGroupId(null)
        void load()
      }}
    >
      <Shell
        groups={boot.groups}
        groupId={current.id}
        onSwitch={(id) => {
          localStorage.setItem('cm.group', id)
          setGroupId(id)
        }}
        displayName={boot.profile?.display_name ?? ''}
        marketingOptIn={boot.profile?.marketing_opt_in ?? false}
        notifyNew={boot.profile?.notify_new ?? true}
        onNameChanged={() => void load()}
      />
    </DataProvider>
  )
}

export function Shell({
  groups,
  groupId,
  onSwitch,
  displayName,
  marketingOptIn,
  notifyNew,
  onNameChanged,
}: {
  groups: GroupRef[]
  groupId: string
  onSwitch: (id: string) => void
  displayName: string
  marketingOptIn: boolean
  notifyNew: boolean
  onNameChanged: () => void
}) {
  const d = useData()
  const [tab, setTab] = useState<Tab>('shop')
  const [sharing, setSharing] = useState(OPENED_BY_SHARE)
  const [tour, setTour] = useState<Tour | null>(null)
  const [tourOpen, setTourOpen] = useState(true)
  const needCount = useRef(d.needs.length)
  const storeCount = useRef(d.allStores.length)
  useEffect(() => {
    // il passaggio finisce quando la persona fa davvero l'azione mostrata
    if (tour?.doneWhen === 'need-added' && d.needs.length > needCount.current) setTourOpen(false)
    if (tour?.doneWhen === 'store-added' && d.allStores.length > storeCount.current) setTourOpen(false)
    needCount.current = d.needs.length
    storeCount.current = d.allStores.length
  }, [d.needs.length, d.allStores.length, tour])
  useEffect(() => {
    if (OPENED_BY_SHARE) history.replaceState(null, '', '/')
  }, [])
  const entered = useRef(false)
  useEffect(() => {
    if (entered.current || !d.loaded || sharing) return
    entered.current = true
    const fresh = d.needs.length === 0 && d.boughtNeeds.length === 0 && !d.suggestions.some((x) => x.status === 'pending')
    // la prima volta in assoluto si apre la Guida; poi, con la lista vuota, l'Elencone
    const seenKey = `cm_seen_guide_${d.userId}`
    if (fresh && !localStorage.getItem(seenKey)) {
      localStorage.setItem(seenKey, '1')
      setTab('guide')
    } else if (fresh) setTab('list')
  }, [d.loaded, d.needs.length, d.boughtNeeds.length])

  const go = (t: Tab) => {
    setTab(t)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="app">
      <InstallPopup />
      {tour && <Spotlight tour={tour} text={tour.text(d.isAdmin)} open={tourOpen} onClose={() => setTour(null)} />}
      <main>
        {sharing && (
          <ShareScreen
            onDone={() => {
              setSharing(false)
              entered.current = true
              go('shop')
            }}
          />
        )}
        {!sharing && tab === 'list' && <ListScreen goto={go} />}
        {!sharing && tab === 'shop' && <ShopScreen goto={go} />}
        {!sharing && tab === 'stores' && <StoresScreen />}
        {!sharing && tab === 'ideas' && <IdeasScreen />}
        {!sharing && tab === 'guide' && (
          <GuideScreen
            goto={go}
            onTour={(id) => {
              const t = TOURS.find((x) => x.id === id)
              if (!t) return
              needCount.current = d.needs.length
              storeCount.current = d.allStores.length
              go(t.tab)
              setTourOpen(true)
              setTour(t)
            }}
          />
        )}
        {!sharing && tab === 'group' && (
          <GroupScreen
            groups={groups}
            groupId={groupId}
            onSwitch={onSwitch}
            displayName={displayName}
            marketingOptIn={marketingOptIn}
            notifyNew={notifyNew}
            onNameChanged={onNameChanged}
          />
        )}
      </main>
      <nav className="tabbar" aria-label="Sezioni">
        <TabBtn active={tab === 'shop'} onClick={() => go('shop')} label="Cosa manca" badge={d.needs.length}>
          <IconCart />
        </TabBtn>
        <TabBtn active={tab === 'list'} onClick={() => go('list')} label="Elencone">
          <IconList />
        </TabBtn>
        <TabBtn active={tab === 'stores'} onClick={() => go('stores')} label="Negozi">
          <IconStore />
        </TabBtn>
        <TabBtn active={tab === 'group'} onClick={() => go('group')} label="Gruppo">
          <IconUsers />
        </TabBtn>
        <TabBtn active={tab === 'guide'} onClick={() => go('guide')} label="Guida">
          <IconBook />
        </TabBtn>
        <TabBtn active={tab === 'ideas'} onClick={() => go('ideas')} label="Idee">
          <IconInbox />
        </TabBtn>
      </nav>
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  label,
  badge = 0,
  alert,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  badge?: number
  alert?: boolean
  children: React.ReactNode
}) {
  return (
    <button className={active ? 'on' : ''} onClick={onClick} aria-current={active ? 'page' : undefined}>
      <span className="ico">
        {children}
        {badge > 0 && <b className={'badge' + (alert ? ' alert' : '')}>{badge}</b>}
      </span>
      <span>{label}</span>
    </button>
  )
}
