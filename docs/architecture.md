# Architettura

```
PDF/EPUB/TXT/JSON ──► [app Mac: barra dei menu] ──► backend Python (OmniVoice) ──► ~/Documents/Grillo Parlante/books/<id>/
                              │                                                       book.json · cover · text/ · chapters/*.mp3
                              └── capitolo pronto ──► Turso (books, chapter_audio) ──► app di ascolto (repo ilmatta, fomo)
```

## Processi

- **Electron main** (`electron/`)
  - `runtime.ts`: trova o installa il Python con OmniVoice (`backend/runtime/install_managed_runtime.py`).
  - `queue.ts`: un processo `python -m app.cli` alla volta; legge eventi JSON da stdout.
  - `library.ts`: legge i `book.json` della libreria; protocollo `grillo://` per audio e copertine (con Range).
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
  - `convert`: per ogni capitolo scelto, pezzi da ~600 caratteri → OmniVoice → WAV in `work/`
    (ripresa automatica) → MP3 48 kbps in `chapters/NNN.mp3`. Il titolo del capitolo viene annunciato
    solo per libri e documentazione (`readTitles`), non per articoli e notizie.

## Turso

```sql
books(id TEXT PRIMARY KEY, json TEXT, cover BLOB, cover_mime TEXT, updated_at TEXT)
chapter_audio(book_id TEXT, idx INTEGER, part INTEGER, data BLOB)  -- pezzi da 512 KB
```

La configurazione guidata (`electron/tursoSetup.ts`, IPC `turso:setup`) usa la Platform API
(`https://api.turso.tech/v1`) con un Platform API token che non viene salvato: organizzazione, gruppo (creato in
Europa se manca), database `grillo` (riusato se esiste, risposta 409), chiavi `full-access` e `read-only` con
`expiration=never`. Poi salva come `turso:save` (con `sync.reset()`); le tabelle le crea `testConnection`.

Le app di ascolto sono in `TursoSettings.apps` (`{ id, name, url }`, predefinite `https://ilmatta.vercel.app` e `https://fomo.vercel.app`). `turso:qr`
restituisce un QR per ogni app con un indirizzo: `<url>/#setup?db=<libsql>&token=<readToken>`.

Il client (`shared/turso.ts`) parla direttamente con l'API HTTP di Turso (`/v2/pipeline`), senza dipendenze,
così lo stesso file può essere copiato nelle PWA (con il token di sola lettura). Nella scheda caricata un
capitolo risulta `ready` solo quando tutti i suoi pezzi audio sono già su Turso.

## Contratto con le app di ascolto

Le PWA ([ilmatta](https://github.com/stefanocerri/ilmatta) o altre con lo stesso schema) leggono da Turso la colonna `books.json`, cioè il `book.json`. Campi utili:
`kind`, `title`, `author`, `cover`, `publishedAt`, `expiresAt` e, per ogni capitolo, `title`, `status`,
`duration`, `size`, `parts` e `meta` (sezione, fonte, link, data). I tipi sono in `shared/contracts.ts`.
Per tipo: `SELECT json FROM books WHERE json_extract(json, '$.kind') = 'notiziario'`.
