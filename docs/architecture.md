# Architettura

```
PDF/EPUB/TXT/JSON ──► [app Mac: barra dei menu] ──► backend Python (OmniVoice) ──► ~/Documents/Grillo Parlante/books/<id>/
                              │                                                       book.json · cover · text/ · chapters/*.mp3
                              └── capitolo pronto ──► Turso (books, chapter_audio) ──► database di ogni app destinataria ──► app di ascolto (ilmatta, fomo, skal)
```

## Processi

- **Electron main** (`electron/`)
  - `runtime.ts`: trova o installa il Python con OmniVoice (`backend/runtime/install_managed_runtime.py`).
  - `queue.ts`: un processo `python -m app.cli` alla volta; legge eventi JSON da stdout.
  - `library.ts`: legge i `book.json` della libreria; protocollo `grillo://` per audio e copertine (con Range).
    `readBook` unisce `book.json` con `info.json` (`bookDetails.ts`): titolo, autore, informazioni e copertina
    trovati online o corretti a mano; `readRawBook` dà il `book.json` così com'è.
  - `bookLookup.ts`: cerca le informazioni su Google Books e Open Library (prima per ISBN, poi titolo e autore),
    applica da solo solo i risultati sicuri; correzioni a mano e copertina scelta dall'utente.
  - `tray.ts`: icona nella barra dei menu (percentuale durante la conversione, file trascinati, menu "Esci").
  - `popover.ts`: pannello 380×600 sotto l'icona, si chiude quando perde il focus (non durante i dialoghi).
  - `sync.ts`: carica su Turso i capitoli pronti, poi la scheda del libro; toglie da Turso le notizie scadute.
    Registro in `userData/turso-sync.json`. Ricontrolla tutto all'avvio e ogni ora.
  - `main.ts`: IPC e invio di uno "snapshot" completo dello stato al pannello a ogni cambiamento.
    Niente Dock: `app.dock.hide()` e `LSUIElement` nel `package.json`.
- **Interfaccia** (`frontend/`): React, si limita a mostrare lo snapshot e chiamare le azioni IPC. Finché
  `snapshot.onboarded` è falso mostra la configurazione guidata (`components/Onboarding.tsx`), che usa
  `system:check` (`electron/system.ts`: processore, spazio libero, Python, Homebrew) e salva `onboarded` in
  `settings.json`.
  Libreria divisa per tipo (Libri, Articoli, Notizie, Documenti), nuovo import, scheda, impostazioni.
- **Backend** (`backend/app/`)
  - `import`: estrae il testo e trova i capitoli:
    - PDF: segnalibri (agganciati al titolo dentro la pagina), senza intestazioni, piè di pagina e numeri di pagina;
    - EPUB: ordine di lettura (spine), indice collegato ai file e alle ancore, senza la pagina dell'indice;
    - JSON: un capitolo per articolo (vedi [json-input.md](json-input.md));
    - altrimenti indice → titoli → parti da ~15 min.
    Poi pulisce il testo e salva `book.json` + `text/NNN.txt`.
  - `convert`: per ogni capitolo scelto, testo scritto come si legge → pezzi → OmniVoice → WAV in `work/`
    (ripresa automatica) → montaggio → MP3 48 kbps in `chapters/NNN.mp3`. Il titolo del capitolo viene annunciato
    solo per libri e documentazione (`readTitles`), non per articoli e notizie.
    Tutte le impostazioni della lettura stanno in `tts/settings.py`, in due profili:
    - **naturale** (voci incluse):
      - `text_spoken.py`: abbreviazioni, simboli, date, ore, decimali e numeri romani scritti in lettere;
        trattini di dialogo e parentesi diventano pause, le righe TUTTE MAIUSCOLE minuscole;
      - `chunking/chunker.py`: pezzi fino a 280 caratteri tagliati solo a fine frase, mai a cavallo di un
        paragrafo (quelli sotto i 120 caratteri si uniscono al vicino); ogni pezzo sa se chiude un paragrafo o una
        scena (`***`). OmniVoice sopra i 30 secondi ridividerebbe il testo per conto suo, azzerando l'intonazione
        dove capita, e cancella gli a capo senza lasciare uno spazio;
      - `tts/pacing.py`: la durata di ogni pezzo la calcoliamo noi dal campione della voce (lettere al secondo
        senza le pause, più un tempo per ogni segno di punteggiatura) e la passiamo a OmniVoice con `duration=`.
        Il campione si usa con `preprocess_prompt=False`: altrimenti OmniVoice ne accorcia le pause prima di
        misurarlo, la voce sembra più veloce (fino al 10%) e le parole escono attaccate;
      - `tts/omnivoice_engine.py`: 48 passi di generazione; un pezzo con durata fuori scala, un buco di silenzio
        o il volume a fondo scala si rigenera una volta;
      - `audio/montage.py`: ogni pezzo portato allo stesso volume e rifilato alla voce, poi pause precise:
        0,6 s tra frasi, 1,0 s a fine paragrafo, 1,4 s dopo il titolo, 1,9 s al cambio di scena, con una
        dissolvenza di 15 ms alle giunture.
    - **classico** (voci create dall'utente): la lettura di prima, senza nessuna di queste modifiche (pezzi da
      600 caratteri, 0,35 s fissi tra un pezzo e l'altro, parametri di default di OmniVoice).
    `work/impostazioni.txt` ricorda con quali impostazioni, voce e velocità sono stati fatti i pezzi: se cambiano,
    i pezzi lasciati a metà si rifanno. Variabili d'ambiente: `GRILLO_NUM_STEP`, `GRILLO_GUIDANCE`,
    `GRILLO_PROFILO=naturale|classico` (oltre a `GRILLO_DEVICE` e `GRILLO_DTYPE`).
    Confronto tra impostazioni: `backend/runtime/voice_compare.py`; test: `python -m pytest backend/tests`.

## Turso

```sql
books(id TEXT PRIMARY KEY, json TEXT, cover BLOB, cover_mime TEXT, updated_at TEXT)
chapter_audio(book_id TEXT, idx INTEGER, part INTEGER, data BLOB)  -- pezzi da 512 KB
chapter_text(book_id TEXT, idx INTEGER, text TEXT)  -- testo letto dalla voce, paragrafi separati da una riga vuota;
                                                    -- caricato con l'audio del capitolo (e aggiunto ai capitoli già su)
```

Canali (`electron/channels.ts`): ogni app di ascolto collegata ha il suo database Turso (`grillo-<id>`),
creato con la Platform API (`electron/tursoSetup.ts`, IPC `channel:connect`). `ChannelStore` tiene in
`settings.json` i canali e le destinazioni dei libri (`targets`); `ChannelSync` carica in ogni database solo i
libri destinati a quel canale e toglie gli altri; `ChannelLink` ogni 30 s scrive `grillo_status` e gestisce la
casella `requests` (file mandati dall'app → importazione → `choose` → `queued` → `converting` → `done`).
Protocollo, tabelle e stati in `shared/channel.ts`, copiato nel kit delle app (skal).

Il client (`shared/turso.ts`) parla direttamente con l'API HTTP di Turso (`/v2/pipeline`), senza dipendenze,
così lo stesso file può essere copiato nelle PWA (con il token di sola lettura). Nella scheda caricata un
capitolo risulta `ready` solo quando tutti i suoi pezzi audio sono già su Turso.

## Contratto con le app di ascolto

Le PWA ([ilmatta](https://github.com/stefanocerri/ilmatta) o altre con lo stesso schema) leggono da Turso la colonna `books.json`, cioè il `book.json`. Campi utili:
`kind`, `title`, `author`, `cover`, `publishedAt`, `expiresAt`, `info` (editore, data, lingua, ISBN, descrizione,
argomenti, pagine: tutti facoltativi; titolo, autore e `info` sono già quelli finali, con le correzioni) e, per ogni capitolo, `title`, `status`,
`duration`, `size`, `parts` e `meta` (sezione, fonte, link, data). I tipi sono in `shared/contracts.ts`.
Per tipo: `SELECT json FROM books WHERE json_extract(json, '$.kind') = 'notiziario'`.
