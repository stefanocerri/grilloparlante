# Architettura

```
PDF/EPUB/TXT/JSON ──► [app Mac: Electron] ──► backend Python (OmniVoice) ──► ~/Documents/Grillo Parlante/books/<id>/
                                                                               book.json · cover · text/ · chapters/*.mp3
```

## Processi

- **Electron main** (`electron/`)
  - `runtime.ts`: trova o installa il Python con OmniVoice (`backend/runtime/install_managed_runtime.py`).
  - `queue.ts`: un processo `python -m app.cli` alla volta; legge eventi JSON da stdout.
  - `library.ts`: legge i `book.json` della libreria; protocollo `grillo://` per audio e copertine (con Range).
  - `main.ts`: IPC e invio di uno "snapshot" completo dello stato all'interfaccia a ogni cambiamento.
- **Interfaccia** (`frontend/`): React, si limita a mostrare lo snapshot e chiamare le azioni IPC.
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

## Contratto con l'app di ascolto

L'app per il telefono (progetto separato) leggerà `book.json` e i file in `chapters/`. Campi utili:
`kind`, `title`, `author`, `cover`, `publishedAt`, `expiresAt` e, per ogni capitolo, `title`, `status`,
`file`, `duration` e `meta` (sezione, fonte, link, data). I tipi sono in `shared/contracts.ts`.
