# Grillo parlante

Da libri e articoli ad audio con voce italiana, capitolo per capitolo, tutto in locale sul Mac.

È un'app della **barra dei menu** (niente icona nel Dock): clic sull'icona per aprire il pannello, trascina un
file sull'icona per importarlo, tasto destro per uscire. Mentre converte, accanto all'icona compare la percentuale.

1. **Importa** un PDF, un EPUB, un testo (TXT/MD) o un articolo/notiziario in JSON: l'app estrae il testo e
   divide i capitoli (segnalibri del PDF, indice dell'EPUB, oppure un capitolo per articolo).
2. **Scegli la voce** tra quattro voci italiane: Marco, Paolo, Giulia e Anna.
3. **Converti** quando vuoi: un capitolo, "fino al capitolo N" o tutto. Se chiudi l'app, la conversione
   riparte da dove era rimasta.
4. **Turso**: ogni capitolo pronto viene caricato sul tuo database Turso. La PWA di ascolto
   [ilmatta](https://github.com/stefanocerri/ilmatta) (e qualunque altra PWA che usa lo stesso schema) legge
   da lì. Le notizie con `expiresAt` passato vengono tolte da Turso; sul Mac restano.

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
Nell'app pacchettizzata lo stesso passo si fa dalla configurazione guidata al primo avvio.

## Primo avvio: configurazione guidata

Al primo avvio il pannello apre una guida in sei passi, pensata per chi non ha mai usato il Terminale:

1. **Benvenuto**: cosa fa l'app e quanto ci vuole (circa 15 minuti, quasi tutti di download).
2. **Il tuo Mac**: controlla da sola processore, spazio libero (ne servono circa 8 GB) e Python. Se Python manca,
   mostra i comandi da copiare (Homebrew e poi `python@3.12`) con il pulsante per aprire il Terminale e "Ricontrolla".
3. **Motore voce**: installa OmniVoice con la barra di avanzamento; se qualcosa va storto mostra i dettagli e "Riprova".
4. **Voce**: anteprime delle quattro voci; quella scelta diventa la predefinita.
5. **Telefono** (facoltativo): account Turso, comandi già pronti da copiare, campi da incollare, prova della
   connessione e QR per il telefono.
6. **Pronto**: riepilogo e "Scegli il primo file".

Si può saltare in qualsiasi momento e rifare da Impostazioni → **Configurazione guidata**. Chi aveva già collegato
Turso prima di questa versione non la vede.

## Interfaccia

Stile sobrio in bianco e nero con bordi sottili, ispirato alle dashboard per sviluppatori: font
[Geist](https://vercel.com/font) (licenza SIL OFL, dal pacchetto npm `geist`), segue il tema chiaro o scuro del Mac.
I colori sono variabili CSS in `frontend/src/styles/index.css`, i componenti di base (pulsanti, card, badge, campi)
sono classi Tailwind nello stesso file. In basso una barra di stato mostra sempre motore voce e Turso.

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

L'app di ascolto per il telefono ora vive in un repository a parte:
[stefanocerri/ilmatta](https://github.com/stefanocerri/ilmatta). Legge da Turso con il token di sola lettura;
dopo averla pubblicata (per esempio su Vercel) incolla il suo indirizzo nelle Impostazioni dell'app Mac.
Il client Turso è copiato lì da `shared/turso.ts`: se cambi lo schema, aggiornalo in entrambi.

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
