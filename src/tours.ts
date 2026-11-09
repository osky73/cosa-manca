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
    text: () => 'In Elencone, sposta un prodotto a destra e viene segnalato come mancante.',
    doneWhen: 'need-added',
  },
  {
    id: 'quantity',
    question: 'Come faccio ad aggiungere la quantità di un prodotto?',
    tab: 'list',
    selector: '[data-tour~="missing-row"]',
    text: () =>
      'In Elencone, tocca un prodotto che manca: nella scheda scrivi la quantità (es. 3 pacchi, 500 gr) o usa − e +, poi tocca «Salva». Sul prodotto comparirà davanti al nome, ad esempio «500 gr di burro».',
    empty: 'Prima segna un prodotto come mancante (spostalo a destra in Elencone), poi riprova.',
  },
  {
    id: 'note',
    question: 'Posso aggiungere una nota ad un prodotto?',
    tab: 'list',
    selector: '[data-tour~="missing-row"]',
    text: () =>
      'Sì. In Elencone, tocca un prodotto che manca e scrivi la nota nella scheda, poi tocca «Salva». Accanto al nome compare una piccola icona: in Cosa manca, toccando il prodotto, la nota si apre sotto il nome per qualche secondo.',
    empty: 'Prima segna un prodotto come mancante (spostalo a destra in Elencone), poi riprova.',
  },
  {
    id: 'new-product',
    question: 'Cosa faccio se voglio segnalare un prodotto non in elenco?',
    tab: 'list',
    selector: '[data-tour="new-product"]',
    text: (admin) =>
      admin
        ? 'Aggiungi un nuovo prodotto: finisce subito in Elencone.'
        : "Suggerisci un nuovo prodotto e l'amministratore del Gruppo lo mette in Elencone.",
    scroll: 'end',
  },
  {
    id: 'add-store',
    question: 'Come faccio ad aggiungere un nuovo negozio per le nostre spese?',
    tab: 'stores',
    selector: '[data-tour="add-store"]',
    text: (admin) =>
      admin
        ? 'Se il negozio è tra i loghi, accendilo con il suo interruttore. Se non c’è, scrivi qui il nome, scegli un colore e tocca «Aggiungi negozio».'
        : 'Se il negozio è tra i loghi, accendilo con il suo interruttore. Se non c’è, scrivi qui il nome, scegli un colore e tocca «Suggerisci negozio»: lo approva l’amministratore.',
    doneWhen: 'store-added',
  },
  {
    id: 'bug',
    question: 'Cosa faccio se trovo un bug?',
    tab: 'ideas',
    selector: '[data-tour="idea-form"]',
    text: () => 'Segnalalo qui, in Idee: scrivi che è un bug e racconta cosa è successo.',
  },
]
