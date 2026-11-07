# Cosa manca

Web app (PWA) mobile-first per segnare ciò che manca in casa, condivisa da un gruppo (famiglia).
Stack: Vite + React + TypeScript, Supabase (database, login con codice via email, aggiornamenti in tempo reale), hosting su Vercel.

## Cosa fa (fase 1)

- Login senza password: codice a 6 cifre via email.
- Un gruppo con amministratore e membri; inviti per email (entrano da soli al primo accesso con quell'email).
- Catalogo predefinito (provvisorio, in `supabase/schema.sql`) copiato nel gruppo alla creazione.
- Segnare "manca" con un tap, scegliendo (facoltativo) UN supermercato per richiesta con le icone.
- Suggerimenti dei membri: **ricorrente** (serve l'approvazione dell'admin, entra nel catalogo) o **una tantum** (compare subito in lista, sparisce dopo l'acquisto).
- Scheda "Spesa": vista per supermercato, schermo sempre acceso, tap per segnare "preso" con Annulla.
- Funziona offline (le azioni sulla lista si accodano e partono al ritorno della rete), aggiornamento in tempo reale tra telefoni.

## Messa in funzione

### 1. Supabase
1. Crea un progetto su supabase.com (regione EU).
2. SQL Editor → incolla ed esegui tutto `supabase/schema.sql`.
3. Esegui anche (con la tua email): `insert into public.admin_allowlist (email) values ('tua@email.it');`
   Finché la tabella è vuota chiunque può creare un gruppo; con la tua email dentro, solo tu.
4. Authentication → Email Templates → **Magic Link** (e anche **Confirm signup**): nel testo metti `{{ .Token }}` per mostrare il codice, ad esempio: `Il tuo codice per Cosa manca è: {{ .Token }}`.
5. Authentication → Emails → SMTP Settings: configura un SMTP personalizzato (es. Resend). Senza, Supabase consegna solo ai membri del tuo team.
6. Settings → API: copia **Project URL** e **anon public key** (mai la service_role).

### 2. Variabili d'ambiente
Copia `.env.example` in `.env.local` per lo sviluppo; su Vercel imposta le stesse due variabili (Production e Preview).

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

### 3. Sviluppo e deploy
```
npm install
npm run dev        # sviluppo locale
npm run build      # controllo tipi + build
```
Deploy: importa la cartella (o il repository Git) su Vercel come progetto Vite; `vercel.json` gestisce il fallback della single-page app.

## Note di progetto
- Il modello dati è già multi-gruppo (un utente può stare in più gruppi): per aprire ad altre famiglie basta svuotare `admin_allowlist`.
- Il catalogo globale (`catalog_items`) lo gestisce il super-admin da Supabase; i gruppi ricevono una copia indipendente.
- Sicurezza: tutte le tabelle hanno Row Level Security; i membri non possono scrivere direttamente su catalogo e suggerimenti, solo tramite le funzioni `propose_item` e `decide_suggestion`.
