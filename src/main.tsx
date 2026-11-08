import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Splash from './Splash'
import './styles.css'

class Guard extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) {
    return { err }
  }
  reset = async () => {
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations()) ?? []
      await Promise.all(regs.map((r) => r.unregister()))
      for (const k of await caches.keys()) await caches.delete(k)
    } catch {
      /* ignore */
    }
    location.reload()
  }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui', color: '#1b2a21' }}>
        <h2>Ops, qualcosa non va</h2>
        <p>{String(this.state.err.message || this.state.err)}</p>
        <button onClick={this.reset} style={{ padding: '12px 18px', fontSize: 16 }}>
          Ricarica l'app
        </button>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Guard>
      <App />
      <Splash />
    </Guard>
  </StrictMode>,
)
