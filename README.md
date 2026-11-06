# Grillo parlante

App desktop locale macOS-first per convertire PDF, EPUB e file testuali in output audio organizzati per libro e capitolo.

Stack:
- Electron
- React
- Tailwind CSS
- TypeScript
- Python backend locale
- TTS selezionabile dalla UI:
  - Supertonic 3 (default): on-device via ONNX, multilingua, veloce, voci gia pronte
  - Qwen3-TTS 0.6B: motore beta gestito dall'app per voice cloning da sample
- ffmpeg per merge e conversione audio

## Obiettivo del MVP

Questa foundation implementa un flusso reale:

1. carica un file locale da UI
2. avvia un job Python locale via subprocess
3. estrae il testo
4. prova a trovare capitoli via TOC o heading
5. crea chunk leggibili
6. genera audio chunk per chunk
7. unisce i chunk per capitolo quando richiesto
8. scrive manifest, raw text, chapter index e output audio
9. riporta progress, step, log, warning e risultato nella UI

In sviluppo locale, se Qwen beta o ffmpeg non sono disponibili, la pipeline non si rompe:
- Qwen fallback: placeholder WAV generato localmente
- ffmpeg fallback: concatenazione WAV nativa

Questo rende il progetto eseguibile subito e pronto a ricevere integrazioni più forti.

## Struttura progetto

```text
.
├── backend/
│   ├── app/
│   │   ├── audio/
│   │   ├── chaptering/
│   │   ├── chunking/
│   │   ├── config/
│   │   ├── extractors/
│   │   ├── jobs/
│   │   ├── outputs/
│   │   ├── tts/
│   │   ├── utils/
│   │   └── cli.py
│   ├── examples/
│   └── requirements.txt
├── docs/
│   ├── architecture.md
│   └── design-system.md
├── electron/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── lib/
│   │   └── styles/
│   ├── index.html
│   └── vite.config.ts
├── output/
├── scripts/
│   └── bootstrap_backend.sh
└── shared/
    └── contracts.ts
```

## Architettura scelta

Electron e Python comunicano tramite subprocess locale con `stdout` strutturato in JSON lines.

Motivi della scelta:
- niente server locale da mantenere
- facile progress reporting
- log in tempo reale
- cancellation semplice con `SIGTERM`
- packaging e debug più lineari su macOS

Dettagli estesi: [docs/architecture.md](/Users/stefanocerri/Progetti/Mind Dimension/Grillo parlante/docs/architecture.md)

## UI e design

La UI segue una direzione editoriale / brutalist-light:
- titoli oversize
- header accent forte
- griglia netta
- palette ridotta
- bordi sottili
- log e statistiche trattati come elementi grafici, non solo tecnici

Design tokens e componenti: [docs/design-system.md](/Users/stefanocerri/Progetti/Mind Dimension/Grillo parlante/docs/design-system.md)

## Setup macOS

### 1. Prerequisiti per sviluppo locale

Installa Homebrew se non è già presente, poi:

```bash
brew install python@3.11 ffmpeg
```

Verifica:

```bash
python3 --version
ffmpeg -version
node --version
npm --version
```

Consigliato:
- Node 20+
- Python 3.11+

### 2. Dipendenze frontend / desktop

Dalla root del progetto:

```bash
npm install
```

### 3. Ambiente Python locale per sviluppo

Usa il virtual environment dentro `backend/.venv`:

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt
```

In alternativa puoi usare lo script:

```bash
./scripts/bootstrap_backend.sh
```

## Motore Supertonic (default)

[Supertonic](https://github.com/supertone-inc/supertonic) e il motore TTS predefinito. Gira interamente in locale tramite ONNX Runtime (nessuna GPU, nessun server, nessun runtime gestito da installare).

Vantaggi nel progetto:
- **Velocita**: molto piu veloce del tempo reale anche su CPU. Su Mac Apple Silicon, misurato su italiano, RTF ~0.09-0.18 single thread a seconda della qualita.
- **Italiano nativo**: 31 lingue supportate, italiano incluso (`lang="it"`).
- **Zero setup voce**: 10 voci preset pronte (`F1..F5`, `M1..M5`). Non serve registrare o fornire un sample.
- **Voce personalizzata opzionale**: si puo incollare un JSON creato con Supertone Voice Builder (campo "Voce personalizzata").
- **Parallelizzazione**: la pipeline sintetizza i chunk su piu worker in parallelo (uno per core), riusando una sessione ONNX per thread.

Controlli in UI (pannello impostazioni):
- **Motore voce**: select Supertonic / Qwen.
- **Voce**: una delle 10 preset.
- **Qualita**: 5 (veloce) / 8 (bilanciata) / 10 (alta) / 12 (massima) step.
- **Velocita**: rispettata nativamente (0.7-1.4), a differenza di Qwen.

Override ambiente per sviluppo:
- `GRILLO_SUPERTONIC_MODEL` (default `supertonic-3`)
- `GRILLO_SUPERTONIC_MODEL_DIR` (cartella modelli custom)
- `GRILLO_SUPERTONIC_WORKERS` (numero di worker paralleli)
- `GRILLO_SUPERTONIC_INTRA_THREADS` (thread ONNX per worker)
- `GRILLO_SUPERTONIC_STEPS` (step di default se non passati dai settings)

Il modello (~99M parametri) viene scaricato da Hugging Face al primo utilizzo e poi resta in cache locale.

### Stima tempi: 200 pagine da un PDF

Riferimento misurato su Mac Apple Silicon, italiano, chunk in parallelo (4 worker):

- 200 pagine ≈ 300.000-360.000 caratteri ≈ ~5,5-6 ore di audio.
- Qualita bilanciata (8 step): circa **15-25 minuti** totali di conversione.
- Qualita veloce (5 step): circa **10-15 minuti**.

Per confronto, lo stesso libro con Qwen 0.6B su CPU richiederebbe diverse ore. Tempi reali variano con CPU, numero di worker e densita testo del PDF.

## Configurazione Qwen beta

L'integrazione non assume piu un comando CLI nel `PATH`.

Il progetto ora usa due modalita:
- sviluppo locale: se Qwen non e disponibile nel runtime gestito, la pipeline puo ancora usare il fallback placeholder per non bloccare il lavoro
- app desktop packaged: l'utente vede un pannello `Motore voce` e puo installare o riparare il runtime Qwen dal primo avvio senza aprire Terminale

Il runtime gestito viene preparato sotto:

```text
~/Library/Application Support/Grillo parlante/runtimes/qwen/
```

Durante il setup l'app:
- crea un ambiente Python dedicato
- installa le dipendenze backend
- installa il pacchetto `qwen-tts`
- verifica che il runtime Qwen sia importabile
- genera una reference voice neutra locale per la modalita `standard`

Il backend usa Qwen tramite import Python diretto, con rilevamento automatico `it` / `en`.
Il download completo del modello viene completato al primo utilizzo reale della sintesi e puo richiedere qualche minuto.

Percorso utile:
[backend/app/tts/qwen_runner.py](/Users/stefanocerri/Progetti/Mind Dimension/Grillo parlante/backend/app/tts/qwen_runner.py)

Nota etica:
- la struttura supporta gia reference audio esplicito tramite `referenceAudioPath`
- non è progettata attorno all'imitazione di persone reali
- la modalita default resta una voce neutra e leggibile gestita dal runtime locale

### Override utili per sviluppo

Variabili ambiente supportate:
- `GRILLO_BOOTSTRAP_PYTHON_PATH`: Python usato per creare il runtime gestito
- `GRILLO_PYTHON_PATH`: Python usato dal backend in sviluppo
- `GRILLO_QWEN_MODEL`: modello Qwen da caricare
- `GRILLO_QWEN_DEVICE`: forza `cpu`, `cuda` o `auto`
- `GRILLO_QWEN_DTYPE`: `float32`, `float16` o `bfloat16`
- `GRILLO_DEFAULT_REFERENCE_AUDIO`: reference audio locale custom per test
- `GRILLO_DEFAULT_REFERENCE_TEXT`: trascrizione del sample neutro gestito

Se sul Mac non esiste alcun Python bootstrap, l'app mostra anche il comando suggerito:

```bash
brew install python@3.11
```

### Benchmark developer Qwen

Per misurare cold start, prompt build e sintesi del runtime beta puoi usare:

```bash
backend/.venv/bin/python backend/runtime/qwen_benchmark.py \
  --model-name "Qwen/Qwen3-TTS-12Hz-0.6B-Base" \
  --text "Questo e un test rapido della voce." \
  --reference-path "/percorso/sample.wav" \
  --reference-text "Questo e il testo realmente letto nel sample." \
  --output-path "/tmp/grillo-qwen-benchmark.wav"
```

Metriche minime registrate dal benchmark:
- modello e device usato
- versione Python e piattaforma
- presenza o meno della trascrizione sample
- tempo di load modello
- tempo di costruzione prompt voce
- tempo di sintesi
- tempo totale
- sample rate e dimensione output

Gate pratici per promuovere Qwen oltre la beta:
- installazione del runtime stabile su Mac reali senza interventi manuali extra
- una conversione di capitolo breve deve chiudersi senza crash ripetibili
- cold start e latenza devono restare accettabili su hardware target
- la qualita percepita deve superare nettamente il motore macOS e rendere inutile XTTS nel progetto

### Confronto voci italiane

`backend/runtime/voice_compare.py` legge lo stesso brano italiano con più motori e voci e
crea `output/voice-compare/index.html` (con nomi e tempi) e `index_cieco.html` (alla cieca,
per votare senza pregiudizi). Ogni motore è opzionale: se il pacchetto manca viene saltato.

| Motore | Licenza | Clonazione | Note |
|---|---|---|---|
| `supertonic` | quella del modello Supertonic | no | default attuale, varianti voce × step |
| `kokoro` | Apache-2.0 | no | voci `if_sara`, `im_nicola`, molto leggero |
| `chatterbox` | MIT | sì (serve `--reference`) | Chatterbox Multilingual, mette un watermark nell'audio |
| `voxcpm` | Apache-2.0 | sì + voice design | VoxCPM2, crea voci da una descrizione |
| `qwen` | Apache-2.0 | sì (serve `--reference`) | lo stesso Qwen3-TTS della beta |

I motori PyTorch vanno in venv separati; lanciando lo script più volte sulla stessa `--out`
i risultati si sommano.

```bash
# 1. motori leggeri
backend/.venv/bin/python backend/runtime/voice_compare.py --engines supertonic,kokoro

# 2. VoxCPM2: voci "disegnate" da descrizione, nessuna persona reale
python -m venv /tmp/vc-voxcpm && /tmp/vc-voxcpm/bin/pip install voxcpm soundfile
/tmp/vc-voxcpm/bin/python backend/runtime/voice_compare.py --engines voxcpm \
  --design "Voce maschile italiana matura, profonda e pacata, narratore di audiolibri"

# 3. clonazione della voce disegnata con gli altri motori
python -m venv /tmp/vc-chatterbox && /tmp/vc-chatterbox/bin/pip install chatterbox-tts soundfile
/tmp/vc-chatterbox/bin/python backend/runtime/voice_compare.py --engines chatterbox \
  --reference output/voice-compare/design/voce_design.wav \
  --reference-text-file output/voice-compare/design/voce_design.txt
```

## Sviluppo locale

Avvio completo desktop + renderer:

```bash
npm run dev
```

Questo lancia:
- Vite renderer su `http://localhost:5173`
- TypeScript watch per Electron
- Electron desktop app con reload del processo principale

Il backend Python parte solo quando premi `Convert`.

In sviluppo:
- puoi installare il runtime Qwen dal pannello `Motore voce`
- se non lo installi, la conversione resta eseguibile con audio placeholder
- `Lingua = Auto` rileva se il testo e in italiano o inglese e usa il profilo corretto
- se usi `voiceMode = reference`, inserisci un percorso valido in `Audio riferimento`
- se aggiungi anche `Testo del sample`, il clone di Qwen di solito migliora sensibilmente

## Build

Build renderer + main Electron + packaging macOS:

```bash
npm run build
```

Output previsto:
- renderer compilato in `dist/`
- processo Electron compilato in `dist-electron/`
- pacchetto desktop in `release/`

Comportamento atteso della build desktop:
- i file sotto `backend/runtime/` vengono inclusi con il backend nei resource bundle Electron
- al primo avvio packaged, il pannello `Motore voce` propone l'installazione del runtime gestito
- la conversione packaged viene bloccata finche il runtime non e pronto o riparato

## Disinstallazione runtime

Buttare solo la `.app` nel cestino non rimuove automaticamente i dati del runtime in `Application Support`.

Per una rimozione pulita:
1. apri l'app
2. usa `Rimuovi runtime` dal pannello `Motore voce`
3. poi elimina la `.app` se vuoi disinstallare tutto

Questo flusso permette di riparare, aggiornare o rimuovere completamente il motore senza toccare Python globale o il `PATH`.

## Pipeline backend

Moduli principali:
- `file_detector.py`
- `extractors/pdf_extractor.py`
- `extractors/epub_extractor.py`
- `chaptering/toc_detector.py`
- `chaptering/heading_detector.py`
- `chunking/chunker.py`
- `tts/qwen_runner.py`
- `audio/ffmpeg_merge.py`
- `outputs/manifest_writer.py`
- `jobs/conversion_job.py`

Comportamento:
- PDF: prova estrazione testuale diretta
- EPUB: parsing nativo del contenuto HTML/XML
- TXT/MD: supporto semplice già incluso
- TOC prima, heading dopo, fallback sectioning infine
- chunking guidato da lunghezza target e break di frase
- audio per chunk
- merge finale per capitolo se attivo
- output manifestato in JSON

## Schermate implementate

- Home / Dropzone
- Processing view con progress, step rail, stats e log
- Result view con capitoli, preview player e open output folder
- Error state con dettaglio tecnico espandibile

## Formati input supportati nel MVP

- PDF
- EPUB
- TXT
- MD

OCR:
- non implementato nel MVP
- architettura pronta per un extractor/fallback OCR futuro

## Output prodotto

Struttura tipica:

```text
output/
  my-book-1712270000/
    manifest.json
    raw_text.txt
    chapters.json
    chunks.json
    audio/
      chapter-01-intro-part-001.wav
      chapter-01-intro-part-002.wav
    final/
      chapter-01.mp3
      chapter-02.mp3
```

Manifest esempio:
[backend/examples/sample_manifest.json](/Users/stefanocerri/Progetti/Mind Dimension/Grillo parlante/backend/examples/sample_manifest.json)

## Scelte tecniche importanti

- niente backend remoto obbligatorio
- niente overengineering con API server locale persistente
- TTS pluggable
- ffmpeg opzionale ma consigliato
- output e log pensati per debugging reale
- UI non bloccante con event stream dal backend

## Prossimi step consigliati

1. Validare il runtime Qwen gestito su build packaged macOS reali.
2. Aggiungere OCR opzionale per PDF scansionati.
3. Migliorare il chaptering con TOC strutturata EPUB e heading scoring più ricco.
4. Aggiungere settings persistenti su disco.
5. Valutare se bundlare anche un Python relocatable per eliminare ogni bootstrap esterno.
