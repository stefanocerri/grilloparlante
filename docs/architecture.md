# Architettura

```
PDF/EPUB ──► [app Mac: Electron] ──► backend Python (OmniVoice) ──► ~/Documents/Grillo Parlante/books/<id>/
                    │                                                   book.json · cover · text/ · chapters/*.mp3
                    └──── capitolo pronto ──► Turso (books, chapter_audio) ──► PWA sul telefono
```

## Processi

- **Electron main** (`electron/`)
  - `runtime.ts`: trova o installa il Python con OmniVoice (`backend/runtime/install_managed_runtime.py`).
  - `queue.ts`: un processo `python -m app.cli` alla volta; legge eventi JSON da stdout.
  - `library.ts`: legge i `book.json` della libreria; protocollo `grillo://` per audio e copertine (con Range).
  - `sync.ts`: carica su Turso i capitoli pronti, poi la scheda del libro. Registro in `userData/turso-sync.json`.
  - `main.ts`: IPC e invio di uno "snapshot" completo dello stato all'interfaccia a ogni cambiamento.
- **Interfaccia** (`frontend/`): React, si limita a mostrare lo snapshot e chiamare le azioni IPC.
- **Backend** (`backend/app/`)
  - `import`: estrae testo, trova i capitoli (segnalibri PDF → indice → titoli → parti da ~15 min),
    pulisce il testo e salva `book.json` + `text/NNN.txt`.
  - `convert`: per ogni capitolo scelto, pezzi da ~600 caratteri → OmniVoice → WAV in `work/`
    (ripresa automatica) → MP3 48 kbps in `chapters/NNN.mp3`.

## Turso

```sql
books(id TEXT PRIMARY KEY, json TEXT, cover BLOB, cover_mime TEXT, updated_at TEXT)
chapter_audio(book_id TEXT, idx INTEGER, part INTEGER, data BLOB)  -- pezzi da 512 KB
```

Il client (`shared/turso.ts`) parla direttamente con l'API HTTP di Turso (`/v2/pipeline`), senza
dipendenze, così lo stesso codice serve all'app Mac (token di scrittura) e alla PWA (token di sola lettura).
Nella scheda caricata un capitolo risulta `ready` solo quando tutti i suoi pezzi audio sono già su Turso.
