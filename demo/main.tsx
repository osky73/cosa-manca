import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Shell } from '../src/App'
import { DataProvider } from '../src/data'
import { ToastProvider } from '../src/toast'
import Splash from '../src/Splash'
import '../src/styles.css'
import { demo } from './supabase'

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
