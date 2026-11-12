type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const CATS: Record<string, string[]> = {
  Frigo: ['Latte', 'Burro', 'Yogurt', 'Mozzarella', 'Prosciutto cotto di Parma affettato sottile e senza polifosfati', 'Uova'],
  Dispensa: ['Pasta', 'Riso', 'Pane', 'Caffè', 'Biscotti', 'Passata di pomodoro', 'Olio'],
  'Frutta e verdura': ['Mele', 'Banane', 'Insalata', 'Zucchine', 'Patate'],
  Bevande: ['Acqua frizzante', 'Succo di frutta', 'Birra'],
  Surgelati: ['Piselli', 'Pizza surgelata'],
  'Igiene e casa': ['Carta igienica', 'Detersivo piatti', 'Sapone mani', 'Dentifricio'],
  Altro: ['Pile', 'Sacchetti spazzatura'],
}

export function seed(): Record<string, Row[]> {
  const now = Date.now()
  const stores: Row[] = [
    { id: 's1', name: 'Esselunga', color: '#2f7d4f', logo: 'esselunga' },
    { id: 's2', name: 'Lidl', color: '#1c7ed6', logo: 'lidl' },
    { id: 's3', name: 'Carrefour', color: '#d9480f', logo: 'carrefour' },
    { id: 's4', name: 'Conad', color: '#c2255c', logo: 'conad' },
    { id: 's5', name: 'Il Gigante', color: '#8a5a00', logo: null },
  ].map((s, i) => ({ group_id: 'g1', sort: i, active: i < 4, note: null, created_at: new Date(now + i).toISOString(), ...s }))

  const items: Row[] = []
  for (const [category, names] of Object.entries(CATS))
    names.forEach((name, sort) =>
      items.push({ id: `i-${name}`, group_id: 'g1', name, category, recurrence: 'recurring', hidden: false, archived: false,
        default_store_id: null, sort, created_by: 'u1' }))
  items.push({ id: 'i-torta', group_id: 'g1', name: 'Torta compleanno', category: 'Altro', recurrence: 'one_off', hidden: false,
    archived: false, default_store_id: null, sort: 5, created_by: 'u2' })

  const need = (item: string, store: string | null, by = 'u1', status = 'missing', min = 5): Row => ({
    id: `n-${item}`, group_id: 'g1', item_id: `i-${item}`, status, store_id: store, note: null, requested_by: by,
    requested_at: new Date(now - min * 60000).toISOString(),
    ...(status === 'bought' ? { bought_at: new Date(now - 60000).toISOString(), bought_by: 'u1' } : {}),
  })
  return {
    group_items: items,
    stores,
    needs: [
      need('Latte', 's1'), need('Prosciutto cotto di Parma affettato sottile e senza polifosfati', 's2', 'u2'), need('Uova', 's2', 'u2', 'missing', 20), need('Carta igienica', null, 'u3', 'missing', 45),
      need('Torta compleanno', 's3', 'u2', 'missing', 10), need('Pasta', 's1', 'u1', 'bought'),
    ],
    suggestions: [
      { id: 'sg1', group_id: 'g1', name: 'Yogurt greco', category: 'Frigo', recurrence: 'recurring', note: null, store_id: null,
        suggested_by: 'u3', status: 'pending', created_at: new Date(now - 3600000).toISOString() },
    ],
    memberships: [
      { group_id: 'g1', user_id: 'u1', role: 'admin' },
      { group_id: 'g1', user_id: 'u2', role: 'member' },
      { group_id: 'g1', user_id: 'u3', role: 'member' },
    ],
    profiles: [
      { id: 'u1', email: 'andrea@example.com', display_name: 'Andrea' },
      { id: 'u2', email: 'elisa@example.com', display_name: 'Elisa' },
      { id: 'u3', email: 'gianni@example.com', display_name: 'Gianni' },
    ],
    invitations: [],
    feedback: [],
  }
}
