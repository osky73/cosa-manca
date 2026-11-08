import type { Tab } from './types'

/** Un passaggio della guida: vai in una schermata, oscura tutto e metti in luce un punto con una scritta. */
export interface Tour {
  id: string
  question: string // titolo nella Guida
  tab: Tab
  selector: string // l'elemento da evidenziare (attributo data-tour)
  text: (isAdmin: boolean) => string
  scroll?: 'end'
  doneWhen?: 'need-added'
}

export const TOURS: Tour[] = [
  {
    id: 'mark-missing',
    question: 'Come si segnalano i prodotti che mancano?',
    tab: 'list',
    selector: '[data-tour="first-row"]',
    text: () => 'Sposta un prodotto a destra e viene evidenziato nella sezione Cosa manca.',
    doneWhen: 'need-added',
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
]
