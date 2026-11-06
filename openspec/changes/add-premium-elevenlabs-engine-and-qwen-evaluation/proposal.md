## Why

La qualita del parlato locale ottenuta finora con voci macOS e con XTTS beta non e abbastanza naturale per un prodotto audiobook-facing. Qwen3-TTS e molto piu promettente di XTTS per clone, voice design e resa multilingua, ma introduce un runtime sensibilmente piu pesante e piu rischioso per una desktop app macOS-first distribuita a utenti non tecnici.

## What Changes

- Aggiungere un motore TTS premium opzionale basato su ElevenLabs come percorso consigliato per la massima qualita vocale.
- Mantenere un percorso locale affidabile con motore macOS come fallback sempre disponibile senza setup cloud.
- Trattare Qwen3-TTS come modalita sperimentale di ricerca e benchmarking, non come default del prodotto o prerequisito della conversione.
- Introdurre un flusso esplicito di scelta motore voce con messaging chiaro su qualita, costi, privacy e requisiti macchina.
- Aggiungere un flusso di import della voce di riferimento da file locale audio/video per i motori che la supportano.
- Evitare come strategia principale il workflow "genero una voce con ElevenLabs e poi la passo a XTTS/Qwen", privilegiando invece l'uso diretto del provider premium quando si sceglie un servizio cloud.

## Capabilities

### New Capabilities
- `premium-cloud-tts-provider`: Configurazione e utilizzo di un provider TTS premium con API key, scelta voce e conversione cloud opzionale.
- `local-tts-engine-selection`: Selezione esplicita del motore voce tra fallback locale stabile e modalita sperimentali, con blocchi e avvisi coerenti.
- `voice-reference-import`: Import e preparazione di file audio/video locali come campione voce per i motori che supportano reference cloning.
- `qwen-tts-evaluation-track`: Track sperimentale separata per validare Qwen3-TTS su qualita, latenze, requisiti hardware, packaging e idoneita al prodotto.

### Modified Capabilities

## Impact

- Frontend Electron/React: pannello impostazioni TTS, setup provider, messaging qualita/costi/privacy.
- Electron main/preload: gestione sicura API key, engine routing, policy tra locale e cloud.
- Backend Python: nuovo adapter provider premium, import reference media, benchmark runner per Qwen3-TTS.
- Dipendenze: client API ElevenLabs opzionale, eventuale runtime Qwen3-TTS in ambiente isolato solo per evaluation.
- Packaging e support: documentazione setup, limiti provider, stima costi e requisiti hardware per la track Qwen.
