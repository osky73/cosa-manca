import type { Tab } from '../types'

interface Topic {
  title: string
  text: string
  go?: { label: string; tab: Tab }
}

// Struttura iniziale della guida: ogni argomento può avere una scorciatoia che porta alla schermata giusta.
// I testi sono una bozza da sviluppare.
const TOPICS: Topic[] = [
  {
    title: 'Segnare ciò che manca',
    text: 'In Elencone trovi tutti i prodotti: trascina una riga verso destra, o toccala, per segnarla come mancante. In Cosa manca la trovi pronta da comprare.',
    go: { label: 'Vai a Elencone', tab: 'list' },
  },
  {
    title: 'Fare la spesa',
    text: 'In Cosa manca scegli il negozio di ogni prodotto e, quando lo compri, trascina la riga per segnarlo come comprato.',
    go: { label: 'Vai a Cosa manca', tab: 'shop' },
  },
  {
    title: 'Scegliere i negozi',
    text: 'In Negozi accendi i supermercati che usate. Ne puoi aggiungere anche di personalizzati.',
    go: { label: 'Vai a Negozi', tab: 'stores' },
  },
  {
    title: 'Invitare la famiglia',
    text: 'In Gruppo invita altre persone per email e scegli se sono amministratori o membri.',
    go: { label: 'Vai a Gruppo', tab: 'group' },
  },
  {
    title: 'Dirci cosa ti manca',
    text: "Hai un'idea o ti manca una funzione? Scrivicela in Idee.",
    go: { label: 'Vai a Idee', tab: 'ideas' },
  },
]

export default function GuideScreen({ goto }: { goto: (t: Tab) => void }) {
  return (
    <div className="screen">
      <header className="top">
        <h1>Guida</h1>
        <p className="tagline">Come usare Cosa manca, con le scorciatoie per andare subito dove serve.</p>
      </header>
      <div className="guide-list">
        {TOPICS.map((t) => (
          <section key={t.title} className="guide-card">
            <h3>{t.title}</h3>
            <p>{t.text}</p>
            {t.go && (
              <button className="btn ghost slim" onClick={() => goto(t.go!.tab)}>
                {t.go.label} →
              </button>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
