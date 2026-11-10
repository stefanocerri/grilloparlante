# Grillo parlante

Da libri e articoli ad audio con voce italiana, capitolo per capitolo, tutto in locale sul Mac.

È un'app della **barra dei menu** (niente icona nel Dock): clic sull'icona per aprire il pannello, trascina un
file sull'icona per importarlo, tasto destro per uscire. Mentre converte, accanto all'icona compare la percentuale.

1. **Importa** un PDF, un EPUB, un testo (TXT/MD) o un articolo/notiziario in JSON: l'app estrae il testo e
   divide i capitoli (segnalibri del PDF, indice dell'EPUB, oppure un capitolo per articolo).
2. **Scegli la voce** tra quattro voci italiane: Marco, Paolo, Giulia e Anna.
3. **Converti** quando vuoi: un capitolo, "fino al capitolo N" o tutto. Se chiudi l'app, la conversione
   riparte da dove era rimasta.
4. **Ascolta sul telefono**: ogni capitolo pronto viene caricato sul tuo database Turso e le app di ascolto
   ([ilmatta](https://github.com/stefanocerri/ilmatta), [fomo](https://github.com/stefanocerri/fomo)) lo
   scaricano da lì, anche per l'ascolto offline. Le notizie con `expiresAt` passato vengono tolte da Turso; sul
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
4. **Voce**: anteprime delle quattro voci; quella scelta diventa la predefinita.
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

## Turso e app di ascolto

Gli audio si ascoltano sul telefono: Grillo li carica sul tuo database Turso e le app di ascolto li scaricano
da lì. Il piano gratuito di Turso ha 5 GB, cioè circa 25–30 libri da 8 ore.

### Strada guidata (consigliata)

1. Crea un account gratuito su [turso.tech](https://app.turso.tech).
2. Nella dashboard, nelle impostazioni, sezione **API Tokens**, crea un *Platform API token* e copialo.
3. In Grillo (configurazione guidata, passo "Telefono", oppure Impostazioni → Turso) incollalo e premi
   **Configura**.

Grillo usa la [Platform API](https://docs.turso.tech/api-reference/introduction) di Turso dal processo
principale (`electron/tursoSetup.ts`): sceglie l'organizzazione (se sono più d'una te la fa scegliere), usa il
primo gruppo esistente o ne crea uno in Europa, crea il database `grillo` (se c'è già lo riusa: si può ripetere),
crea una chiave di scrittura e una di sola lettura senza scadenza, le salva, crea le tabelle e prova la
connessione. Il Platform API token **non viene salvato**: serve solo durante la configurazione.

### Strada avanzata (CLI)

Se hai già un database, o preferisci la CLI:

```bash
turso db create grillo
turso db show grillo --url
turso db tokens create grillo
turso db tokens create grillo --read-only
```

Poi in Impostazioni → Turso apri **Configurazione avanzata** e inserisci indirizzo, chiave di scrittura (resta
sul Mac) e chiave di sola lettura (va alle app del telefono). Schema delle tabelle in `shared/turso.ts`.

### App di ascolto e QR

Le app per il telefono vivono in repository separati: [ilmatta](https://github.com/stefanocerri/ilmatta)
(audiolibri) e [fomo](https://github.com/stefanocerri/fomo), pubblicate su
[ilmatta.vercel.app](https://ilmatta.vercel.app) e [fomo.vercel.app](https://fomo.vercel.app). Sono gli indirizzi
predefiniti: appena Turso è configurato, in Impostazioni → **App di ascolto** compare un QR per ognuna, che apre
quell'app già collegata. Gli indirizzi si possono cambiare lì (campo vuoto = torna al predefinito). Il link ha questo formato, letto da ilmatta in `src/lib/config.ts`:

```text
<indirizzo-app>/#setup?db=<libsql://...>&token=<chiave di sola lettura>
```

Tutto sta nel frammento `#`, quindi non arriva mai al server dell'app; nei QR va sempre e solo la chiave di
sola lettura. I vecchi `settings.json` con un solo `pwaUrl` vengono letti come indirizzo di ilmatta (tranne il
vecchio predefinito `https://grilloparlante.vercel.app`, che non esiste più).

Il client Turso è copiato in ilmatta da `shared/turso.ts`: se cambi lo schema, aggiornalo in entrambi.

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

Icona dell'app: `assets/icon.svg` (sorgente) e `assets/icon.png` (1024 px). Per provare tutto c'è un PDF breve
con tre capitoli: `backend/examples/il-grillo-e-la-lanterna.pdf`. Dettagli tecnici in [docs/architecture.md](docs/architecture.md).
