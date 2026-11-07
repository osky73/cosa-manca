import { useMemo, useState, type FormEvent } from 'react'
import { useData } from '../data'
import { Sheet } from '../components'
import { InstallCard } from '../install'
import { supabase } from '../supabase'
import { IconEye, IconEyeOff, IconShare, IconTrash } from '../icons'
import { STORE_COLORS, byCategoryThenName, norm } from '../lib'
import { useToast } from '../toast'
import type { GroupRef, Member } from '../types'

export default function GroupScreen({
  groups,
  groupId,
  onSwitch,
  displayName,
  onNameChanged,
}: {
  groups: GroupRef[]
  groupId: string
  onSwitch: (id: string) => void
  displayName: string
  onNameChanged: () => void
}) {
  const d = useData()
  const toast = useToast()
  const group = groups.find((g) => g.id === groupId)
  const [selected, setSelected] = useState<Member | null>(null)
  const [email, setEmail] = useState('')
  const [storeName, setStoreName] = useState('')
  const [storeColor, setStoreColor] = useState(STORE_COLORS[0])
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [catQuery, setCatQuery] = useState('')
  const [name, setName] = useState(displayName)

  const catalog = useMemo(() => {
    const qn = norm(catQuery)
    return [...d.items].filter((i) => !qn || norm(i.name).includes(qn)).sort(byCategoryThenName)
  }, [d.items, catQuery])

  async function share(to: string) {
    const url = location.origin
    const text = `Ti ho invitato su "Cosa manca", la lista della spesa di casa. Apri ${url}, aggiungila alla schermata Home e accedi con ${to}: ti arriva un codice via email.`
    try {
      if (navigator.share) await navigator.share({ title: 'Cosa manca', text, url })
      else {
        await navigator.clipboard.writeText(text)
        toast.show('Messaggio copiato: incollalo su WhatsApp')
      }
    } catch {
      /* condivisione annullata */
    }
  }

  async function invite(e: FormEvent) {
    e.preventDefault()
    const em = email.trim().toLowerCase()
    if (!em) return
    if (await d.invite(em)) {
      setEmail('')
      toast.show('Invito creato: ora condividilo')
      void share(em)
    }
  }

  async function addStore(e: FormEvent) {
    e.preventDefault()
    if (!storeName.trim()) return
    await d.addStore(storeName, storeColor)
    setStoreName('')
  }

  async function saveName() {
    const n = name.trim()
    if (!n || n === displayName) return
    const { error } = await supabase.from('profiles').update({ display_name: n }).eq('id', d.userId)
    if (error) toast.show('Non sono riuscito a salvare il nome')
    else {
      toast.show('Nome aggiornato')
      onNameChanged()
      void d.refetch()
    }
  }

  return (
    <div className="screen">
      <header className="top sticky">
        <div className="top-row">
          <h1>{group?.name ?? 'Gruppo'}</h1>
          {d.isAdmin && <span className="pill">Admin</span>}
        </div>
      </header>

      {groups.length > 1 && (
        <section className="card">
          <label className="field">
            <span>Gruppo</span>
            <select value={groupId} onChange={(e) => onSwitch(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      <section>
        <h2 className="section">
          Persone <span className="count">{d.members.length}</span>
        </h2>
        <ul className="rows">
          {d.members.map((m) => (
            <li key={m.user_id}>
              <button
                className="row-main"
                disabled={!d.isAdmin || m.user_id === d.userId}
                onClick={() => setSelected(m)}
              >
                <span className="grow">
                  <span className="name">
                    {m.profile?.display_name || m.profile?.email || 'Utente'}
                    {m.user_id === d.userId && ' (tu)'}
                  </span>
                  <span className="meta">{m.profile?.email}</span>
                </span>
                <span className={'pill' + (m.role === 'admin' ? ' ok' : '')}>{m.role === 'admin' ? 'Admin' : 'Membro'}</span>
              </button>
            </li>
          ))}
        </ul>

        {d.isAdmin && (
          <>
            {d.invitations.length > 0 && (
              <>
                <h3 className="sub">Inviti in attesa</h3>
                <ul className="rows">
                  {d.invitations.map((inv) => (
                    <li key={inv.id} className="static">
                      <span className="grow">
                        <span className="name">{inv.email}</span>
                        <span className="meta">Entra da solo al primo accesso con questa email</span>
                      </span>
                      <button className="icon-btn" onClick={() => void share(inv.email)} aria-label="Condividi invito">
                        <IconShare />
                      </button>
                      <button className="icon-btn" onClick={() => void d.removeInvitation(inv.id)} aria-label="Annulla invito">
                        <IconTrash />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <form className="card inline-form" onSubmit={(e) => void invite(e)}>
              <label className="field">
                <span>Invita una persona</span>
                <input
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="email@esempio.it"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button className="btn primary" disabled={!email.trim()}>
                Invita
              </button>
            </form>
          </>
        )}
      </section>

      <section>
        <h2 className="section">
          Supermercati <span className="count">{d.stores.length}</span>
        </h2>
        {d.stores.length === 0 && <p className="empty small">Nessun supermercato{d.isAdmin ? ': aggiungine uno qui sotto.' : ' ancora.'}</p>}
        <ul className="rows">
          {d.stores.map((s) => (
            <li key={s.id} className="static" style={{ ['--c' as string]: s.color }}>
              <i className="dot big" />
              <span className="grow">
                <span className="name">{s.name}</span>
              </span>
              {d.isAdmin && (
                <button className="icon-btn" onClick={() => void d.deleteStore(s.id)} aria-label={`Elimina ${s.name}`}>
                  <IconTrash />
                </button>
              )}
            </li>
          ))}
        </ul>
        {d.isAdmin && (
          <form className="card" onSubmit={(e) => void addStore(e)}>
            <label className="field">
              <span>Nuovo supermercato</span>
              <input value={storeName} onChange={(e) => setStoreName(e.target.value)} maxLength={40} placeholder="es. Esselunga" />
            </label>
            <div className="swatches" role="radiogroup" aria-label="Colore">
              {STORE_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  role="radio"
                  aria-checked={storeColor === c}
                  aria-label={c}
                  className={storeColor === c ? 'on' : ''}
                  style={{ background: c }}
                  onClick={() => setStoreColor(c)}
                />
              ))}
            </div>
            <button className="btn primary" disabled={!storeName.trim()}>
              Aggiungi supermercato
            </button>
          </form>
        )}
      </section>

      {d.isAdmin && (
        <section>
          <button className="cat-head" onClick={() => setCatalogOpen(!catalogOpen)} aria-expanded={catalogOpen}>
            <span className="grow">Catalogo del gruppo</span>
            <span className="count">{d.items.length}</span>
          </button>
          {catalogOpen && (
            <>
              <div className="searchbar slim">
                <input type="search" value={catQuery} onChange={(e) => setCatQuery(e.target.value)} placeholder="Cerca nel catalogo" />
              </div>
              <ul className="rows">
                {catalog.map((i) => (
                  <li key={i.id} className={'static' + (i.hidden ? ' dim' : '')}>
                    <span className="grow">
                      <span className="name">{i.name}</span>
                      <span className="meta">
                        {i.category} · {i.recurrence === 'recurring' ? 'ricorrente' : 'una tantum'}
                        {i.hidden ? ' · nascosto' : ''}
                      </span>
                    </span>
                    <button
                      className="icon-btn"
                      onClick={() => void d.setItemHidden(i.id, !i.hidden)}
                      aria-label={i.hidden ? `Mostra ${i.name}` : `Nascondi ${i.name}`}
                    >
                      {i.hidden ? <IconEyeOff /> : <IconEye />}
                    </button>
                    <button className="icon-btn" onClick={() => void d.archiveItem(i.id)} aria-label={`Elimina ${i.name}`}>
                      <IconTrash />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="card">
        <label className="field">
          <span>Il tuo nome</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} onBlur={() => void saveName()} />
        </label>
        <button className="btn ghost" onClick={() => void supabase.auth.signOut()}>
          Esci dall'account
        </button>
        {!d.isAdmin && (
          <button
            className="btn danger"
            onClick={() => {
              if (confirm('Vuoi davvero uscire da questo gruppo?')) void d.leaveGroup()
            }}
          >
            Esci dal gruppo
          </button>
        )}
      </section>

      <InstallCard />

      {selected && (
        <Sheet title={selected.profile?.display_name || selected.profile?.email || 'Persona'} onClose={() => setSelected(null)}>
          <div className="stack">
            <button
              className="btn ghost wide"
              onClick={async () => {
                await d.setMemberRole(selected.user_id, selected.role === 'admin' ? 'member' : 'admin')
                setSelected(null)
              }}
            >
              {selected.role === 'admin' ? 'Rendi membro semplice' : 'Rendi amministratore'}
            </button>
            <button
              className="btn danger wide"
              onClick={async () => {
                if (confirm('Rimuovere questa persona dal gruppo?')) {
                  await d.removeMember(selected.user_id)
                  setSelected(null)
                }
              }}
            >
              Rimuovi dal gruppo
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
