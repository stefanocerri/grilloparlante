## Context

Oggi il pulsante impostazioni vive nella `action-cluster` del `Dropzone` e il pannello è reso come `settings-panel-inline` dentro la colonna principale (`App.tsx`), quindi aprendo le impostazioni il layout si allunga come un blocco accordion. I log dettagliati sono un’area sotto «Stato»; la spunta è solo stato React e non invoca DevTools, mentre in dev gli strumenti si aprono da menu contestuale o scorciatoia in `main.ts`.

## Goals / Non-Goals

**Goals:**

- Trigger impostazioni **fisso in basso a destra** del contenuto finestra (o viewport app), indipendente dallo scroll della colonna.
- Contenuto impostazioni in **popover** (overlay posizionato sopra il trigger, z-index alto), chiusura coerente con click fuori ed Escape.
- All’attivazione di «Mostra log dettagliati» in Electron, **aprire DevTools** (stesso percorso utile per Ispeziona elemento / console), senza richiedere click destro.

**Non-Goals:**

- Ridisegnare il contenuto delle singole impostazioni (TTS, formato, ecc.) oltre allo spostamento nel popover.
- Abilitare DevTools in build pacchettizzata se la policy del progetto li disabilita: il design può limitare l’IPC al solo `!app.isPackaged` o a una flag esplicita.

## Decisions

### 1. Trigger fuori dal Dropzone, shell con anchor bottom-right

**Decisione:** Spostare il bottone impostazioni da `Dropzone` a un wrapper in `App` (o componente dedicato) con `position: fixed` (o `absolute` rispetto a `window-content` con `position: relative`) in basso a destra con padding coerente con il chrome.

**Perché:** Evita che il trigger scrolli con la colonna e soddisfa il requisito “fixed bottom-right”.

**Alternativa:** Mantenere il bottone nel Dropzone ma posizionarlo con `fixed` — scartata perché il trigger non è semanticamente parte della dropzone.

### 2. Popover senza libreria esterna se possibile

**Decisione:** Implementare popover con contenitore posizionato (`fixed`/`absolute`) ancorato al trigger tramite ref + `getBoundingClientRect`, o pattern “popover” con portal React (`createPortal` verso `document.body`) per evitare clipping da `overflow`.

**Perché:** Nessuna nuova dipendenza; controllo su overlay e focus.

**Alternativa:** `@radix-ui/react-popover` — utile se servono accessibilità avanzate; si può valutare in seguito.

### 3. DevTools via IPC dal preload

**Decisione:** Esporre su `window.grillo` un metodo tipo `openDevTools()` che invia `ipcRenderer.invoke` al main; il main chiama `webContents.openDevTools({ mode: "detach" })` allineato allo stile già usato in dev.

**Perché:** Il renderer non può aprire DevTools direttamente con `contextIsolation`.

**Alternativa:** Solo scorciatoia da tastiera — insufficiente per la richiesta dalla checkbox.

### 4. Quando aprire DevTools

**Decisione:** All’`onChange` che porta `showDetailedLogs` a `true`, dopo `setState`, invocare `openDevTools()` se bridge disponibile e (se deciso) solo in dev. Se già aperti, opzionalmente solo `focus()` sulla finestra DevTools.

**Perché:** Comportamento deterministico legato alla spunta.

**Rischio:** Utente che non vuole DevTools ma solo il pannello log — mitigazione: etichetta chiara o due controlli distinti in futuro; per ora la richiesta esplicita è aprire ispezione.

## Risks / Trade-offs

- [Popover copre contenuti] → Ombra/bordo chiaro; max-height + scroll interno se necessario.
- [Click-through sul trigger fisso] → `z-index` sotto ai toast ma sopra al contenuto; area click sufficiente.
- [DevTools in produzione] → Limitare con `isPackaged` o rimuovere API in release se richiesto dalla distribuzione.

## Migration Plan

- Implementazione incrementale: prima spostare UI (trigger + popover), poi IPC DevTools, poi verifica manuale su `npm run dev`.

## Open Questions

- Se in futuro il browser dev servisse senza Electron, `openDevTools` può essere no-op senza errore.
