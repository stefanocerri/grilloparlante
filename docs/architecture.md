# Architecture

## Core decision

Electron lancia un job Python locale come subprocess, invece di parlare con un server HTTP separato.

## Why this path

- meno moving parts
- niente porta locale da gestire
- start del job immediato
- progress e log nativi via `stdout`
- cancellation naturale con segnali di processo
- ottimo fit per macOS-first desktop utility

## Event protocol

Il backend emette JSON lines con tre campi:

```json
{
  "type": "stage",
  "payload": {
    "stage": "extract",
    "label": "Text extraction",
    "message": "Reading source and extracting text."
  },
  "timestamp": "2026-04-05T00:00:00+00:00"
}
```

Eventi previsti:
- `ready`
- `stage`
- `progress`
- `stats`
- `log`
- `warning`
- `result`
- `error`
- `cancelled`

## Electron split

- `electron/main.ts`: finestra, dialog, IPC, lifecycle desktop
- `electron/preload.ts`: API sicura esposta al renderer
- `electron/backendBridge.ts`: spawn del job Python e parsing degli eventi

## Backend split

- `extractors/`: parsing input
- `chaptering/`: capitoli veri o fallback
- `chunking/`: segmentazione leggibile
- `tts/`: adapter motore voce
- `audio/`: merge e conversione
- `outputs/`: raw text, json, manifest
- `jobs/`: orchestrazione

## Current runtime assumptions

- Python installato localmente
- dipendenze Python in `backend/.venv` oppure `python3` di sistema
- runtime XTTS gestito dall'app, con rilevamento automatico `it` / `en`
- ffmpeg opzionale ma consigliato

## Extension points

- OCR extractor per PDF scansione
- motori TTS multipli con selector
- config persistente utente
- queue di job multipli
- packaging più stretto del runtime Python
