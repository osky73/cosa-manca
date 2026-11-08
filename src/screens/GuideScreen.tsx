import { TOURS } from '../tours'

export default function GuideScreen({ onTour }: { onTour: (id: string) => void }) {
  return (
    <div className="screen">
      <header className="top">
        <h1>Guida</h1>
        <p className="tagline">Tocca una domanda: ti porto nel punto dell'app e te lo mostro.</p>
      </header>
      <div className="guide-list">
        {TOURS.map((t) => (
          <button key={t.id} className="guide-card guide-q" onClick={() => onTour(t.id)}>
            <h3>{t.question}</h3>
            <span className="meta">Mostrami →</span>
          </button>
        ))}
      </div>
    </div>
  )
}
