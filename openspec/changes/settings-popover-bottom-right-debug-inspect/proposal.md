## Why

Le impostazioni sono oggi un pannello inline nella colonna principale: quando si aprono spingono il contenuto e sembrano un accordion interno all’app. L’utente vuole un punto fisso in basso a destra e un overlay (popover) che non riorganizzi il layout. Inoltre, la spunta «Mostra log dettagliati» attiva solo il blocco log in-app e non apre gli strumenti di sviluppo: in Electron ci si aspetta che equivalga all’apertura di Ispeziona elemento / DevTools per ispezionare il DOM e la console.

## What Changes

- Spostare il trigger delle impostazioni in un controllo **fisso in basso a destra** (fuori dal flusso della colonna centrale).
- Sostituire il pannello inline con un **popover** (overlay ancorato al trigger) con chiusura su click fuori e Escape; niente più sezione espandibile nella colonna principale.
- Quando l’utente attiva **Mostra log dettagliati**, oltre al pannello log (se resta) **aprire DevTools** nella finestra (stesso effetto utile di “Ispeziona elemento” per debug), tramite IPC/preload dove serve.

## Capabilities

### New Capabilities

- `floating-settings-popover`: Punto di accesso alle impostazioni ancorato in basso a destra; contenuto impostazioni in popover sovrapposto, non in layout inline.

- `debug-logs-open-devtools`: La preferenza per i log dettagliati in ambiente desktop apre anche gli strumenti di sviluppo (DevTools) così l’utente può usare Ispeziona elemento e la console.

### Modified Capabilities

- `optional-debug-log-visibility`: Estendere il comportamento richiesto: oltre a mostrare i log dettagliati quando richiesto, in Electron l’attivazione SHALL aprire DevTools se non già aperti (allineato all’attesa di ispezione).

## Impact

- Frontend: `App.tsx`, layout CSS dello shell, possibile nuovo componente popover/portal; `Dropzone` o zona azioni se il trigger impostazioni è lì oggi.
- Electron: `preload.ts` ed eventualmente `main.ts` per handler IPC `openDevTools` o equivalente sicuro (solo finestre controllate dall’app).
- UX: meno salti di layout al toggle impostazioni; debug più chiaro per sviluppatori e utenti avanzati.
