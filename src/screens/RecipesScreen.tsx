import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useData } from '../data'
import { useToast } from '../toast'
import { Sheet } from '../components'
import { friendly, norm } from '../lib'
import { IconPlus, IconSearch, IconTrash } from '../icons'
import type { Item } from '../types'

interface Recipe {
  id: string
  title: string
  steps: string | null
  ingredients: string[]
  created_by: string
  created_at: string
}

type Found = { text: string; item: Item | null; state: 'missing' | 'inlist' | 'new' }

// "200 g di farina 00" -> "farina 00"
const core = (s: string) =>
  norm(s)
    .replace(/^\d+([.,]\d+)?\s*(kg|gr?|etti|ml|cl|l|cucchiai\w*|cucchiaini?|pizzic\w+|spicch\w+|fette?|bust\w+|conf\w*)?\b\s*/, '')
    .replace(/^(di|d')\s*/, '')
    .trim()

export default function RecipesScreen() {
  const d = useData()
  const toast = useToast()
  const [list, setList] = useState<Recipe[] | null>(null)
  const [open, setOpen] = useState<Recipe | 'new' | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .eq('group_id', d.groupId)
      .order('created_at', { ascending: false })
    if (error) {
      toast.show(friendly(error.message))
      setList([])
      return
    }
    setList((data ?? []) as Recipe[])
  }, [d.groupId, toast])
  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="screen">
      <header className="top">
        <div className="top-row">
          <h1>Ricette</h1>
        </div>
        <p className="tagline">Scrivi le ricette di casa e, con un tocco, segna cosa ti manca per farle.</p>
      </header>
      <button className="btn primary wide" onClick={() => setOpen('new')}>
        + Nuova ricetta
      </button>
      {list === null ? (
        <p className="empty">Carico le ricette…</p>
      ) : list.length === 0 ? (
        <p className="empty">Ancora nessuna ricetta. Scrivi la prima!</p>
      ) : (
        <ul className="rcp-list">
          {list.map((r) => (
            <li key={r.id}>
              <button className="card rcp-card" onClick={() => setOpen(r)}>
                <strong>{r.title}</strong>
                <span className="muted small">
                  {r.ingredients.length} ingredienti · di {d.nameOf(r.created_by)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <RecipeSheet
          recipe={open === 'new' ? null : open}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null)
            void load()
          }}
        />
      )}
    </div>
  )
}

function RecipeSheet({ recipe, onClose, onSaved }: { recipe: Recipe | null; onClose: () => void; onSaved: () => void }) {
  const d = useData()
  const toast = useToast()
  const canEdit = !recipe || recipe.created_by === d.userId || d.isAdmin
  const [title, setTitle] = useState(recipe?.title ?? '')
  const [steps, setSteps] = useState(recipe?.steps ?? '')
  const [ings, setIngs] = useState<string[]>(recipe?.ingredients ?? [])
  const [checked, setChecked] = useState<Found[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)

  const clean = ings.map((s) => s.trim()).filter(Boolean)

  const find = (text: string): Found => {
    const c = core(text)
    const live = d.items.filter((i) => !i.archived)
    const item =
      live.find((i) => norm(i.name) === c) ??
      live.find((i) => c.length >= 3 && (norm(i.name).includes(c) || (norm(i.name).length >= 3 && c.includes(norm(i.name))))) ??
      null
    if (!item) return { text, item: null, state: 'new' }
    return { text, item, state: d.needByItem.has(item.id) ? 'missing' : 'inlist' }
  }
  const check = () => setChecked(clean.map(find))
  useEffect(() => setChecked(null), [ings.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(
    () => ({
      missing: checked?.filter((f) => f.state === 'missing').length ?? 0,
      inlist: checked?.filter((f) => f.state === 'inlist').length ?? 0,
      fresh: checked?.filter((f) => f.state === 'new').length ?? 0,
    }),
    [checked],
  )

  async function save() {
    if (!title.trim() || busy) return
    setBusy(true)
    const row = { title: title.trim(), steps: steps.trim() || null, ingredients: clean }
    const { error } = recipe
      ? await supabase.from('recipes').update(row).eq('id', recipe.id)
      : await supabase.from('recipes').insert({ ...row, group_id: d.groupId, created_by: d.userId })
    setBusy(false)
    if (error) {
      toast.show(friendly(error.message))
      return
    }
    toast.show('Ricetta salvata')
    onSaved()
  }

  async function remove() {
    if (!recipe) return
    const { error } = await supabase.from('recipes').delete().eq('id', recipe.id)
    if (error) {
      toast.show(friendly(error.message))
      return
    }
    toast.show('Ricetta cancellata')
    onSaved()
  }

  async function mark() {
    if (!checked || busy) return
    setBusy(true)
    let added = 0
    let proposed = 0
    let created = 0
    for (const f of checked) {
      if (f.item) {
        if (d.addMissing(f.item) === 'added') added++
      } else {
        try {
          const r = await d.propose({
            name: f.text.replace(/^\d+([.,]\d+)?\s*\w*\s+(di|d')\s*/i, '').trim() || f.text,
            category: 'Altro',
            recurrence: 'recurring',
            note: recipe?.title ? `Per: ${recipe.title}` : title ? `Per: ${title}` : '',
            storeId: null,
            markMissing: true,
          })
          if (r === 'added') created++
          else proposed++
        } catch {
          /* prosegue con gli altri */
        }
      }
    }
    setBusy(false)
    const parts = [
      added + created > 0 ? `${added + created} segnati come mancanti` : '',
      proposed > 0 ? `${proposed} proposti all'admin` : '',
    ].filter(Boolean)
    toast.show(parts.length ? parts.join(' · ') : 'Era già tutto segnato')
    onClose()
  }

  const label = { missing: 'già mancante', inlist: '', new: 'da aggiungere' }

  return (
    <Sheet title={recipe ? 'Ricetta' : 'Nuova ricetta'} onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Nome</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Es. Lasagne della nonna" disabled={!canEdit} />
        </label>
        <label className="field">
          <span>Come si realizza</span>
          <textarea rows={6} value={steps} onChange={(e) => setSteps(e.target.value)} maxLength={5000} placeholder="Scrivi qui i passaggi della ricetta" disabled={!canEdit} />
        </label>
        <div className="field">
          <span>Ingredienti</span>
          {ings.map((v, i) => (
            <div key={i} className="rcp-ing">
              <input
                value={v}
                maxLength={100}
                placeholder="Es. farina 00"
                disabled={!canEdit}
                onChange={(e) => setIngs(ings.map((x, j) => (j === i ? e.target.value : x)))}
              />
              {canEdit && (
                <button
                  type="button"
                  className="btn ghost rcp-minus"
                  aria-label="Togli ingrediente"
                  onClick={() => setIngs(ings.filter((_, j) => j !== i))}
                >
                  −
                </button>
              )}
            </div>
          ))}
          {canEdit && (
<div className="rcp-addrow">
              <button type="button" className="btn ghost rcp-plusbtn" onClick={() => setIngs([...ings, ''])} aria-label="Aggiungi un ingrediente">
                <IconPlus />
              </button>
            </div>
          )}
        </div>

        <div className="rcp-actions">
          <button
            className="btn ghost rcp-icon rcp-check-btn"
            disabled={clean.length === 0}
            onClick={check}
            aria-label="Controlla cosa manca"
            title="Controlla cosa manca"
          >
            <IconSearch />
            <span>Controlla</span>
          </button>
          {canEdit ? (
            <button className="btn primary rcp-save" disabled={!title.trim() || busy} onClick={() => void save()}>
              Salva
            </button>
          ) : (
            <span className="rcp-save" />
          )}
          {recipe && canEdit ? (
            <button
              className="btn ghost rcp-icon rcp-del"
              onClick={() => setAsking(true)}
              aria-label="Cancella ricetta"
              title="Cancella ricetta"
            >
              <IconTrash />
            </button>
          ) : (
            <span className="rcp-icon" />
          )}
        </div>
        {asking && (
          <button className="btn danger wide" onClick={() => void remove()}>
            Sì, cancella la ricetta
          </button>
        )}
        {checked && (
          <ul className="rcp-check">
            {checked.map((f, i) => (
              <li key={i} className={f.state}>
                <span>{f.item?.name ?? f.text}</span>
                <span className="muted small">{label[f.state]}</span>
              </li>
            ))}
          </ul>
        )}

        {checked && counts.missing < checked.length && (
          <button className="btn primary wide" disabled={busy} onClick={() => void mark()}>
            Segna cosa manca
          </button>
        )}
      </div>
    </Sheet>
  )
}
