import type { Tab } from './types'

/** Un passaggio della guida: vai in una schermata, oscura tutto e metti in luce un punto con una scritta. */
export interface Tour {
  id: string
  question: string // titolo nella Guida
  tab: Tab
  selector: string // l'elemento da evidenziare (attributo data-tour)
  text: (isAdmin: boolean) => string
  scroll?: 'end'
  doneWhen?: 'need-added' | 'store-added'
}

export const TOURS: Tour[] = [
  {
    id: 'mark-missing',
    question: 'Come si segnalano i prodotti che mancano?',
    tab: 'list',
    selector: '[data-tour="first-row"]',
    text: () => 'In Elencone, sposta un prodotto a destra e viene segnalato come mancante.',
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
  {
    id: 'add-store',
    question: 'Come faccio ad aggiungere un nuovo negozio per le nostre spese?',
    tab: 'stores',
    selector: '[data-tour="add-store"]',
    // tutti i membri del gruppo possono aggiungere negozi: il percorso è lo stesso per admin e utenti
    text: () =>
      'Se il negozio è tra i loghi, accendilo con il suo interruttore. Se non c’è, scrivi qui il nome, scegli un colore e tocca «Aggiungi negozio».',
    doneWhen: 'store-added',
  },
]
