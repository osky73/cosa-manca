import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Shell } from '../src/App'
import { DataProvider } from '../src/data'
import { ToastProvider } from '../src/toast'
import Splash from '../src/Splash'
import Onboarding from '../src/screens/Onboarding'
import '../src/styles.css'
import { demo } from './supabase'
import './fakeGoogle'

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

// ?attesa mostra la schermata di chi aspetta di essere ammesso
const waiting = location.search.includes('attesa')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {waiting ? (
      <Onboarding userId="u9" profile={{ id: 'u9', display_name: 'Alice' } as never} hasGroup={false} onDone={() => {}} />
    ) : (
      <Demo />
    )}
    <Splash />
  </StrictMode>,
)
