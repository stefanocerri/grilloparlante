# Grillo parlante

Da libri e articoli ad audio con voce italiana, capitolo per capitolo, tutto in locale sul Mac.

È un'app della **barra dei menu** (niente icona nel Dock): clic sull'icona per aprire il pannello, trascina un
file sull'icona per importarlo, tasto destro per uscire. Mentre converte, accanto all'icona compare la percentuale.

1. **Importa** un PDF, un EPUB, un testo (TXT/MD) o un articolo/notiziario in JSON: l'app estrae il testo e
   divide i capitoli (segnalibri del PDF, indice dell'EPUB, oppure un capitolo per articolo).
2. **Scegli la voce** tra quattro voci italiane: Marco, Paolo, Giulia e Anna.
3. **Converti** quando vuoi: un capitolo, "fino al capitolo N" o tutto. Se chiudi l'app, la conversione
   riparte da dove era rimasta.
4. **Turso**: ogni capitolo pronto viene caricato sul tuo database Turso. La PWA di ascolto inclusa in `pwa/`
   (e qualunque altra PWA che usa lo stesso schema) legge da lì. Le notizie con `expiresAt` passato vengono
   tolte da Turso; sul Mac restano.

Tutto gira sul Mac e senza costi: la sintesi usa [OmniVoice](https://huggingface.co/k2-fsa/OmniVoice) in locale,
sulla GPU del Mac quando c'è. I pesi di OmniVoice hanno licenza CC-BY-NC, quindi il progetto è solo per uso
personale e non commerciale.

## Avvio in sviluppo

Prerequisiti: Node 20+, Python 3.10+ (`brew install python@3.12`).

```bash
npm install
```

```bash
./scripts/bootstrap_backend.sh
```

```bash
npm run dev
```

`bootstrap_backend.sh` crea `backend/.venv` con PyTorch e OmniVoice e scarica il modello (circa 5 GB in tutto).
Nell'app pacchettizzata lo stesso passo si fa dal pulsante "Installa il motore voce" al primo avvio.

## Libreria

La libreria si trova in `~/Documents/Grillo Parlante/books/`, con una cartella per libro o articolo:

```text
book.json          titolo, tipo (kind), voce, capitoli con stato e durata
cover.jpg          copertina, se la sorgente ne ha una
text/001.txt       testo pulito di ogni capitolo
chapters/001.mp3   audio dei capitoli convertiti (48 kbps, circa 21 MB per ora)
```

`kind` distingue `libro`, `documentazione`, `articolo` e `notiziario`. Per articoli e notizie viene letto solo il
testo; titolo, fonte, link e date restano in `book.json` (campo `meta` di ogni capitolo).

## Turso

Il piano gratuito di Turso ha 5 GB, cioè circa 25–30 libri da 8 ore. Configurazione una tantum:

```bash
turso db create grillo
turso db show grillo --url
turso db tokens create grillo
turso db tokens create grillo --read-only
```

Nel pannello apri le **Impostazioni** (ingranaggio) e inserisci indirizzo, token di scrittura (resta sul Mac) e
token di sola lettura (da dare alle PWA). Schema delle tabelle in `shared/turso.ts`. Con l'indirizzo della
PWA compilato, nelle Impostazioni compare il **QR** che collega il telefono.

## App per il telefono (PWA)

`pwa/` contiene un'app di ascolto in stile Audible:
- **Libreria**: copertine, card "Continua ad ascoltare", etichette per articoli e notiziari; le notizie scadute
  non compaiono.
- **Scheda**: elenco dei capitoli, con fonte e sezione per gli articoli, e download per l'ascolto offline.
- **Player**: riprende da dove eri rimasto e offre velocità da 0,8× a 2×, salti di ±30 secondi, parte
  precedente e successiva, timer di spegnimento e comandi nella schermata di blocco.

Legge direttamente da Turso con il token di sola lettura. Per pubblicarla gratis su Vercel basta importare il
repository: la configurazione è già in `vercel.json`. Poi incolla l'indirizzo nelle Impostazioni dell'app Mac.

Per lo sviluppo, con un database di prova che imita Turso su `http://127.0.0.1:8099`:

```bash
GRILLO_TURSO_PROXY=http://127.0.0.1:8099 npm run dev:pwa
```

## Articoli e notiziari in JSON

Formato ed esempi in [docs/json-input.md](docs/json-input.md), con `backend/examples/articolo.json` e
`backend/examples/notiziario.json`.

## Backend da riga di comando

```bash
cd backend && .venv/bin/python -m app.cli import --input libro.pdf --voice uomo_01 --library ~/Grillo
```

```bash
cd backend && .venv/bin/python -m app.cli convert --book <id> --chapters 1-3 --library ~/Grillo
```

Le voci stanno in `backend/voices/`: un campione WAV con la trascrizione e un'anteprima MP3. Per
aggiungerne una basta un campione pulito di 10–20 secondi più la riga corrispondente in `voices.json`.

## Build

```bash
npm run build
```

Genera l'app macOS in `release/`. Dettagli tecnici in [docs/architecture.md](docs/architecture.md).
