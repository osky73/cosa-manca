import type { Tab } from './types'

/** Un passaggio della guida: vai in una schermata, oscura tutto e metti in luce un punto con una scritta. */
export interface Tour {
  id: string
  question: string // titolo nella Guida
  tab: Tab
  selector: string // l'elemento da evidenziare (attributo data-tour)
  text: (isAdmin: boolean) => string
  scroll?: 'end'
  empty?: string // avviso se il punto da mostrare non c'è (es. nessun prodotto che manca)
  doneWhen?: 'need-added' | 'store-added'
}

export const TOURS: Tour[] = [
  {
    id: 'mark-missing',
    question: 'Come si segnalano i prodotti che mancano?',
    tab: 'list',
    selector: '[data-tour~="first-row"]',
    text: () => 'Sposta il prodotto mancante a destra',
    doneWhen: 'need-added',
  },
  {
    id: 'quantity',
    question: 'Come faccio ad aggiungere la quantità di un prodotto?',
    tab: 'list',
    selector: '[data-tour~="missing-row"]',
    text: () =>
      'Tocca un prodotto che manca, scrivi la quantità (es. 500 gr) e chiudi',
    empty: 'Prima segna un prodotto come mancante (spostalo a destra in Elencone), poi riprova.',
  },
  {
    id: 'note',
    question: 'Posso aggiungere una nota ad un prodotto?',
    tab: 'list',
    selector: '[data-tour~="missing-row"]',
    text: () =>
      'Sì: tocca un prodotto che manca, scrivi la nota e chiudi',
    empty: 'Prima segna un prodotto come mancante (spostalo a destra in Elencone), poi riprova.',
  },
  {
    id: 'new-product',
    question: 'Cosa faccio se voglio segnalare un prodotto non in elenco?',
    tab: 'list',
    selector: '[data-tour="new-product"]',
    text: (admin) =>
      admin
        ? 'Tocca + e aggiungilo.'
        : 'Tocca + e suggeriscilo: lo approva l’amministratore.',
    scroll: 'end',
  },
  {
    id: 'edit-product',
    question: "Come elimino o modifico un prodotto nell'Elencone?",
    tab: 'list',
    selector: '[data-tour~="free-row"]',
    text: (admin) =>
      admin
        ? 'Tocca il prodotto: scrivi per rinominarlo, cestino per eliminarlo, grip per spostarlo.'
        : 'Lo fa l’amministratore del Gruppo.',
  },
  {
    id: 'add-store',
    question: 'Come faccio ad aggiungere un nuovo negozio per le nostre spese?',
    tab: 'stores',
    selector: '[data-tour="add-store"]',
    text: (admin) =>
      admin
        ? 'Accendi il suo logo. Se manca, scrivi il nome e tocca «Aggiungi negozio».'
        : 'Accendi il suo logo. Se manca, scrivi il nome e tocca «Suggerisci negozio».',
    doneWhen: 'store-added',
  },
  {
    id: 'bug',
    question: 'Cosa faccio se trovo un bug?',
    tab: 'ideas',
    selector: '[data-tour="idea-form"]',
    text: () => 'Scrivilo qui, in Idee: indica che è un bug.',
  },
]
