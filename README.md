# Grillo parlante

Da PDF ad audiolibro con voce italiana, capitolo per capitolo. Si converte sul Mac e si ascolta sul telefono.

1. **Importa** un PDF (o EPUB): l'app estrae il testo e divide i capitoli (usa i segnalibri del PDF se ci sono).
2. **Scegli la voce** tra quattro voci italiane: Marco, Paolo, Giulia e Anna.
3. **Converti** quando vuoi: un capitolo, "fino al capitolo N" o tutto il libro. Se chiudi l'app, la conversione riparte da dove era rimasta.
4. Ogni capitolo pronto viene **caricato su Turso**, e la PWA sul telefono lo legge da lì.

Tutto gira sul Mac e senza costi: la sintesi usa [OmniVoice](https://huggingface.co/k2-fsa/OmniVoice) in locale.
I pesi di OmniVoice hanno licenza CC-BY-NC, quindi il progetto è solo per uso personale e non commerciale.

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

La libreria si trova in `~/Documents/Grillo Parlante/books/`, con una cartella per libro:

```text
book.json          titolo, voce, capitoli con stato e durata
cover.jpg          copertina, se il PDF ne ha una
text/001.txt       testo pulito di ogni capitolo
chapters/001.mp3   audio dei capitoli convertiti (48 kbps, circa 21 MB per ora)
```

## Turso (ascolto sul telefono)

Il piano gratuito di Turso ha 5 GB, cioè circa 25–30 libri da 8 ore. Configurazione una tantum:

```bash
turso db create grillo
```

```bash
turso db show grillo --url
```

```bash
turso db tokens create grillo
```

```bash
turso db tokens create grillo --read-only
```

Nell'app apri **Telefono e Turso** e inserisci l'indirizzo, il token di scrittura (resta sul Mac) e il token di
sola lettura (va al telefono). Premi "Prova la connessione". Il QR che compare apre la PWA già collegata.

## Backend da riga di comando

```bash
cd backend && .venv/bin/python -m app.cli import --input libro.pdf --voice uomo_01 --library ~/Grillo
```

```bash
cd backend && .venv/bin/python -m app.cli convert --book <id> --chapters 1-3 --library ~/Grillo
```

Le voci stanno in `backend/voices/`: un campione WAV con la trascrizione e un'anteprima MP3. Per
aggiungerne una basta un campione pulito di 10–20 secondi più la riga corrispondente in `voices.json`.
Per confrontare motori e voci c'è `backend/runtime/voice_compare.py`.

## Build

```bash
npm run build
```

Genera l'app macOS in `release/`. Dettagli tecnici in [docs/architecture.md](docs/architecture.md).
