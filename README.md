# Grillo parlante

Da libri e articoli ad audio con voce italiana, capitolo per capitolo, tutto in locale sul Mac.

È un'app della **barra dei menu** (niente icona nel Dock): clic sull'icona per aprire il pannello, trascina un
file sull'icona per importarlo, tasto destro per uscire. Mentre converte, accanto all'icona compare la percentuale.

1. **Importa** un PDF, un EPUB, un testo (TXT/MD) o un articolo/notiziario in JSON: l'app estrae il testo e
   divide i capitoli (segnalibri del PDF, indice dell'EPUB, oppure un capitolo per articolo).
2. **Scegli la voce** tra le voci italiane incluse (Marco e Anna) o tra quelle che crei tu.
3. **Converti** quando vuoi: un capitolo, "fino al capitolo N" o tutto. Se chiudi l'app, la conversione
   riparte da dove era rimasta.
4. **Ascolta sul telefono**: ogni capitolo pronto viene caricato sul tuo database Turso e le app di ascolto
   che hai collegato lo scaricano da lì, anche per l'ascolto offline. Le notizie con `expiresAt` passato vengono tolte da Turso; sul
   Mac restano.

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
3. **Narratore**: installa OmniVoice con la barra di avanzamento; se qualcosa va storto mostra i dettagli e "Riprova".
4. **Voce**: anteprime delle voci incluse; quella scelta diventa la predefinita.
5. **Telefono**: incolli un solo Platform API token di Turso, premi "Configura" e Grillo crea database e
   chiavi; poi un QR per ogni app di ascolto da installare sul telefono. Si può rimandare.
6. **Pronto**: riepilogo e "Scegli il primo file".

Si può saltare in qualsiasi momento e rifare da Impostazioni → **Configurazione guidata**. Chi aveva già collegato
Turso prima di questa versione non la vede.

## Interfaccia

Stile sobrio in bianco e nero con bordi sottili, ispirato alle dashboard per sviluppatori: font
[Geist](https://vercel.com/font) (licenza SIL OFL, dal pacchetto npm `geist`), segue il tema chiaro o scuro del Mac oppure quello scelto in Impostazioni → **Aspetto**
(Sistema, Chiaro, Scuro; salvato in `settings.json` e applicato con `nativeTheme.themeSource`).
I colori sono variabili CSS in `frontend/src/styles/index.css`, i componenti di base (pulsanti, card, badge, campi)
sono classi Tailwind nello stesso file. In basso una barra di stato mostra sempre narratore e Turso.

## Libreria: archivio, lettura e ascolto

Dal pannello, l'icona **Libreria** (o "Leggi e ascolta" nella scheda di un libro) apre una finestra più grande:
- a sinistra l'archivio di tutti i libri sul Mac, con ricerca e filtri (Tutto, Solo Mac, per app);
- a destra il libro: destinazioni, capitoli e il **testo** del capitolo scelto, con dimensione regolabile;
- in basso il player: riprende da dove eri rimasto, ±30 secondi, capitolo precedente/successivo, velocità da
  0,8× a 2×, e passa da solo al capitolo dopo.

La copia sul Mac sta in `~/Documents/Grillo Parlante/books/<id>/` (testo in `text/`, audio in `chapters/`):
"Apri nel Finder" la mostra.

## Voci da un campione

Oltre alle voci incluse puoi crearne di nuove: Impostazioni → **Voci** → "Nuova voce da un campione", oppure
il riquadro "Nuova voce" quando scegli la voce di un libro. Carichi un audio di 10–30 secondi con una sola persona
che parla (WAV, MP3, M4A, FLAC), le dai un nome e Grillo la clona con OmniVoice e crea un'anteprima. La
trascrizione è facoltativa: se manca la ricava Whisper (scaricato la prima volta, circa 1,6 GB). Le voci create
stanno in `~/Library/Application Support/Grillo parlante/voices/` (backend: `python -m app.cli voice-create`).
Le voci create prima del taglio in una pausa vera (che ripetevano un pezzo di parola, tipo «ancora un», all'inizio
di ogni frase) si riparano da sole alla prima conversione: il campione si accorcia all'ultima pausa e Whisper lo
ritrascrive; gli originali restano come `<id>.orig.wav` e `<id>.orig.txt`. I capitoli già convertiti con la voce
difettosa restano com'erano.
Usa solo voci che hai il diritto di usare.

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

## App collegate (canali)

I libri restano **sempre sul Mac**, in `~/Documents/Grillo Parlante/books/` (una cartella per libro). In più puoi
mandarli alle app di ascolto per il telefono: ogni app collegata è un **canale** con il suo database gratuito su
Turso, e riceve solo i libri destinati a lei. Le destinazioni si scelgono quando importi un file ("Dove lo ascolti")
e si cambiano dalla scheda del libro; togliere un'app toglie il libro dal suo database, non dal Mac.

Non ci sono app predefinite: si aggiungono da Impostazioni → App collegate (nome e indirizzo). Per crearne una
nuova si parte dal guscio [skal](https://github.com/stefanocerri/skal).

### Collegare un'app

1. Crea un account gratuito su [turso.tech](https://app.turso.tech) e, nelle impostazioni della dashboard
   (sezione **API Tokens**), un *Platform API token*.
2. In Grillo (guida, passo "Telefono", oppure Impostazioni → App collegate) aggiungi l'app, incolla il token e
   premi **Collega**.
3. Inquadra il QR dell'app con il telefono e installala (Condividi → Aggiungi alla schermata Home).

Per ogni app Grillo crea (o riusa) il database `grillo-<app>` con la
[Platform API](https://docs.turso.tech/api-reference/introduction) (`electron/tursoSetup.ts`) e due chiavi
complete senza scadenza: una resta sul Mac, l'altra va all'app nel QR. Il Platform API token resta **solo in
memoria** finché Grillo è aperto (così colleghi più app con un clic), mai su disco. Il QR ha il formato
`<app>/#setup?db=<libsql://...>&token=<chiave app>&channel=<id>&name=<nome>`, tutto nel frammento `#`.

Chi ha già un database può usare "Configurazione avanzata" (indirizzo e chiavi a mano). Chi usava la versione con
un database unico se lo ritrova come canale ilmatta, con i libri già destinati a ilmatta: niente da ricaricare;
allora l'app aveva una chiave di sola lettura, ora Grillo le dà quella completa: basta inquadrare di nuovo il QR.

### Dal telefono a Grillo

Nel database di ogni app Grillo scrive il suo stato ogni 30 secondi (`grillo_status`): l'app mostra un semaforo
(verde = pronto, giallo = sta convertendo o manca il narratore, rosso = Mac spento o Grillo chiuso). L'app può
caricare un PDF/EPUB nella casella `requests`; Grillo lo importa, scrive l'elenco dei capitoli, l'app (o il Mac)
sceglie quali convertire, e il libro arriva solo a quell'app. Protocollo e tabelle in `shared/channel.ts`.

Il piano gratuito di Turso ha 5 GB in tutto (condivisi tra i database), cioè circa 25–30 libri da 8 ore.

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

**Senza Terminale**: su GitHub apri Actions → **App per Mac** → *Run workflow*. Dopo circa 10 minuti, in
Releases compare `Grillo-parlante-<versione>-arm64.dmg` (Mac con chip Apple).
Con un tag `v*` la release diventa definitiva.

**Sul tuo Mac**:

```bash
npm run build:mac
```

Genera in `release/` il `.dmg` e lo `.zip` per i Mac con chip Apple (l'app è in `release/mac-arm64/`). Per un
Mac Intel: `npm run build:mac:intel` (finisce in `release/mac/`; su un Mac con chip Apple girerebbe con Rosetta e
macOS avvisa che le app Intel non saranno più supportate). L'app non è firmata con un certificato Apple:
al primo avvio aprila con tasto destro → **Apri**. Se macOS dice che è danneggiata (succede ai file scaricati),
nel Terminale: `xattr -dr com.apple.quarantine "/Applications/Grillo parlante.app"`.

Icona dell'app: la sagoma del grillo in bianco su nero, `assets/icon.svg` (sorgente) e `assets/icon.png` (1024 px); la
stessa sagoma, `assets/tray.svg`, fa da icona nella barra dei menu e da logo nell'app. I PNG si rigenerano con `node scripts/build-icons.cjs`, il modello 3D con `node scripts/model/build.cjs`. Per provare tutto c'è un PDF breve
con tre capitoli: `backend/examples/il-grillo-e-la-lanterna.pdf`. Dettagli tecnici in [docs/architecture.md](docs/architecture.md).
