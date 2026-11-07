import { useState, type FormEvent } from 'react'
import { supabase } from '../supabase'
import { friendly } from '../lib'
import type { Profile } from '../types'

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
  const needName = !profile?.display_name
  const [name, setName] = useState(profile?.display_name ?? '')
  const [groupName, setGroupName] = useState('Casa')
  const [optIn, setOptIn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

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
      }
      if (!hasGroup) {
        const { error } = await supabase.rpc('create_group', { p_name: groupName })
        if (error) throw error
      }
      onDone()
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as { message?: string }).message ?? 'Errore'
      setErr(friendly(msg))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth">
      <div className="brand">
        <h1>Benvenuto</h1>
        <p>{hasGroup ? 'Come ti chiami?' : 'Facciamo partire il tuo gruppo.'}</p>
      </div>
      <form onSubmit={(e) => void submit(e)} className="card">
        {needName && (
          <label className="field">
            <span>Il tuo nome (lo vedono gli altri)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="given-name" required />
          </label>
        )}
        {needName && (
          <label className="check">
            <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
            <span>Voglio ricevere ogni tanto aggiornamenti sull'app via email (facoltativo, puoi disiscriverti quando vuoi)</span>
          </label>
        )}
        {!hasGroup && (
          <>
            <label className="field">
              <span>Nome del gruppo</span>
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={80} required />
            </label>
            <p className="hint">
              Se stai aspettando un invito, chiedi all'amministratore di invitare questa email e poi riapri l'app. Se invece
              crei un gruppo, ne diventi l'amministratore e potrai invitare gli altri.
            </p>
          </>
        )}
        {err && <p className="error">{err}</p>}
        <button className="btn primary big" disabled={busy || (needName && !name.trim()) || (!hasGroup && !groupName.trim())}>
          {busy ? 'Un attimo…' : 'Continua'}
        </button>
        <button type="button" className="link" onClick={() => void supabase.auth.signOut()}>
          Esci
        </button>
      </form>
    </main>
  )
}
