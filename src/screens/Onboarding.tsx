import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../supabase'
import { friendly } from '../lib'
import type { Profile } from '../types'

type Access = 'ok' | 'pending' | 'none' | 'rejected'

export default function Onboarding({
  userId,
  profile,
  hasGroup,
  onDone,
}: {
  userId: string
  profile: Profile | null
  hasGroup: boolean
  onDone: () => void
}) {
  const [nameSaved, setNameSaved] = useState(false)
  const needName = !profile?.display_name && !nameSaved
  const [name, setName] = useState(profile?.display_name ?? '')
  // chi non ha ancora un gruppo deve essere ammesso: 'ok' può crearlo, 'pending' aspetta il super admin
  const [access, setAccess] = useState<Access | null>(hasGroup ? 'ok' : null)
  const [checking, setChecking] = useState(false)
  const [groupName, setGroupName] = useState('Casa')
  const [optIn, setOptIn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function checkAccess(): Promise<Access> {
    const { data, error } = await supabase.rpc('my_admin_status')
    if (error) throw error
    const a = ((data as Access | null) ?? 'none') as Access
    setAccess(a)
    return a
  }

  // mette la persona "in attesa" e avvisa il super admin (una sola volta)
  async function requestAccess() {
    const { data, error } = await supabase.rpc('request_admin')
    if (error) throw error
    if (data === 'new') {
      setAccess('pending')
      void supabase.functions.invoke('admin-request', { body: { action: 'new' } })
    } else setAccess(data as Access)
  }

  useEffect(() => {
    if (hasGroup || needName) return
    let off = false
    void (async () => {
      try {
        const a = await checkAccess()
        if (!off && a === 'none') await requestAccess()
      } catch (e) {
        if (!off) setErr(friendly(e instanceof Error ? e.message : ((e as { message?: string }).message ?? 'Errore')))
      }
    })()
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGroup, needName])

  async function recheck() {
    setChecking(true)
    setErr('')
    try {
      const a = await checkAccess()
      if (a === 'none') await requestAccess()
    } catch (e) {
      setErr(friendly(e instanceof Error ? e.message : ((e as { message?: string }).message ?? 'Errore')))
    } finally {
      setChecking(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      if (needName) {
        const { error } = await supabase
          .from('profiles')
          .update({ display_name: name.trim(), marketing_opt_in: optIn })
          .eq('id', userId)
        if (error) throw error
        setNameSaved(true)
      }
      if (!hasGroup) {
        const a = access ?? (await checkAccess())
        if (a !== 'ok') {
          // non ancora ammesso: la richiesta parte da sola e si resta in attesa
          if (a === 'none') await requestAccess()
          return
        }
        const { error } = await supabase.rpc('create_group', { p_name: groupName })
        if (error) throw error
      }
      onDone()
    } catch (e) {
      const msg = e instanceof Error ? e.message : ((e as { message?: string }).message ?? 'Errore')
      setErr(friendly(msg))
    } finally {
      setBusy(false)
    }
  }

  if (!hasGroup && !needName && access !== 'ok') {
    const waiting = access === 'pending' || access === 'none' || access === null
    return (
      <main className="auth">
        <div className="brand">
          <h1>{access === 'rejected' ? 'Richiesta non accolta' : 'Richiesta inviata'}</h1>
          <p>
            {access === 'rejected'
              ? 'Per ora non puoi creare un gruppo. Se conosci chi usa Cosa manca, chiedigli di invitarti.'
              : 'Stiamo aprendo Cosa manca a poche persone alla volta. Ti scriviamo per email appena sei ammesso: poi potrai creare il tuo gruppo.'}
          </p>
        </div>
        <div className="card">
          {waiting && (
            <p className="hint">
              Se qualcuno ti ha già invitato in un suo gruppo, chiedigli di usare questa stessa email e poi riapri l'app.
            </p>
          )}
          {err && <p className="error">{err}</p>}
          <button className="btn primary big" disabled={checking} onClick={() => void recheck()}>
            {checking ? 'Controllo…' : 'Controlla di nuovo'}
          </button>
          <button type="button" className="link" onClick={() => void supabase.auth.signOut()}>
            Esci
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="auth">
      <div className="brand">
        <h1>Benvenuto/a</h1>
        <p>{hasGroup ? 'Come ti chiami?' : 'Crea il tuo gruppo di persone a cui «manca qualcosa».'}</p>
      </div>
      <form onSubmit={(e) => void submit(e)} className="card">
        {needName && (
          <label className="field">
            <span>Il tuo nome (lo vedono gli altri)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="given-name"
              required
            />
          </label>
        )}
        {needName && (
          <label className="check">
            <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
            <span>Voglio ricevere gli aggiornamenti sull'app</span>
          </label>
        )}
        {!hasGroup && access === 'ok' && (
          <>
            <label className="field">
              <span>Nome del gruppo</span>
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={80} required />
            </label>
            <p className="hint">
              Se stai aspettando un invito, chiedi all'amministratore di invitare questa email e poi riapri l'app. Se
              invece crei un gruppo, ne diventi l'amministratore e potrai invitare gli altri.
            </p>
          </>
        )}
        {err && <p className="error">{err}</p>}
        <button
          className="btn primary big"
          disabled={busy || (needName && !name.trim()) || (!hasGroup && access === 'ok' && !groupName.trim())}
        >
          {busy ? 'Un attimo…' : 'Continua'}
        </button>
        <button type="button" className="link" onClick={() => void supabase.auth.signOut()}>
          Esci
        </button>
      </form>
    </main>
  )
}
