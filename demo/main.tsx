import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Shell } from '../src/App'
import { DataProvider } from '../src/data'
import { ToastProvider } from '../src/toast'
import Splash from '../src/Splash'
import '../src/styles.css'
import { demo } from './supabase'

// Nell'anteprima la rete esterna è bloccata: la ricerca dei negozi risponde con punti di esempio attorno al centro della mappa.
const realFetch = window.fetch.bind(window)
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.includes('overpass')) {
    const q = decodeURIComponent(String(init?.body ?? ''))
    const at = q.match(/around:\d+,([\d.]+),([\d.]+)/)
    const generic = /"shop"~/.test(q)
    const names = generic ? ['Esselunga', 'Lidl', 'Carrefour', 'Conad', 'Supermercato Rossi', 'Alimentari Da Gino', 'Iperal'] : (q.match(/"name"~"([^"]+)"/)?.[1] ?? '').split('|').map((n) => n.replace(/^\^|\(\[ ,\]\|\$\)$|\\/g, ''))
    const lat = at ? parseFloat(at[1]) : 45.4642
    const lon = at ? parseFloat(at[2]) : 9.19
    const elements = names.filter(Boolean).map((n, i) => ({
      type: 'node',
      id: i + 1,
      lat: lat + Math.sin(i * 0.9) * 0.006 * (1 + (i % 3)),
      lon: lon + Math.cos(i * 0.9) * 0.009 * (1 + (i % 3)),
      tags: { name: n, shop: 'supermarket', opening_hours: 'Mo-Sa 08:00-20:30; Su 09:00-13:00' },
    }))
    return Promise.resolve(new Response(JSON.stringify({ elements }), { headers: { 'Content-Type': 'application/json' } }))
  }
  return realFetch(input, init)
}

function Demo() {
  const [role, setRole] = useState<'admin' | 'member'>('admin')
  demo.role = role
  return (
    <ToastProvider>
      <DataProvider key={role} groupId="g1" userId="u1" role={role} onLeft={() => {}}>
        <Shell
          groups={[{ id: 'g1', name: 'Casa Valle', role }]}
          groupId="g1"
          onSwitch={() => {}}
          displayName="Andrea"
          marketingOptIn={false}
          notifyNew
          onNameChanged={() => {}}
        />
      </DataProvider>
      <button className="demo-role" onClick={() => setRole(role === 'admin' ? 'member' : 'admin')}>
        Vista: {role === 'admin' ? 'Admin' : 'Membro'} ⇄
      </button>
    </ToastProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
    <Splash />
  </StrictMode>,
)
