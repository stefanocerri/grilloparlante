## Context

L'app oggi ha gia un backend locale, una pipeline chunk -> TTS -> merge e un routing motori che negli ultimi esperimenti ha mostrato un compromesso netto: il motore macOS e robusto ma poco naturale; XTTS beta e piu flessibile ma fragile da installare, pesante da mantenere e non abbastanza convincente come resa.

Qwen3-TTS sposta l'asticella qualitativa rispetto a XTTS: supporta 10 lingue incluso italiano, voice clone rapido, voice design e streaming. Pero il progetto upstream raccomanda un ambiente isolato Python 3.12 e FlashAttention 2, e gli esempi ufficiali sono centrati su `cuda:0`, quindi l'adozione come runtime locale packaged per utenti Mac generalisti resta ad alto rischio operativo.

Nel frattempo, se l'utente e disposto a pagare un provider, ElevenLabs offre gia la parte piu importante che ci manca: qualità finale. In quel caso usare ElevenLabs solo per generare una reference voice e poi passarla a XTTS/Qwen aggiunge complessita e perdita di qualita, mentre l'uso diretto del provider premium semplifica il prodotto e allinea costi e risultato percepito.

## Goals / Non-Goals

**Goals:**
- Introdurre un percorso TTS premium che migliori nettamente la qualita percepita rispetto al motore locale.
- Mantenere un fallback locale sempre disponibile, anche offline o senza API key.
- Separare chiaramente i motori `production-ready` da quelli `experimental`.
- Consentire import di reference audio/video locale per i motori che supportano cloning.
- Creare una track di valutazione misurabile per Qwen3-TTS prima di qualsiasi adozione product-default.

**Non-Goals:**
- Non rendere Qwen3-TTS il nuovo runtime packaged di default in questa change.
- Non introdurre download automatico da YouTube o da URL di terze parti come flusso principale di reference voice.
- Non usare ElevenLabs come generatore di una voce "seed" da reiniettare in XTTS/Qwen come architettura consigliata.
- Non risolvere in questa fase il problema di un backend Python completamente self-contained senza bootstrap di sistema.

## Decisions

### 1. Aggiungere ElevenLabs come motore premium diretto

Decisione:
- Aggiungere `elevenlabs` come motore TTS opzionale a fianco di `system` e `xtts`.
- Eseguire le chiamate cloud dal main process / backend, mai dal renderer.
- Salvare l'API key in storage sicuro di piattaforma o in un wrapper dedicato lato desktop, non in plain text nel renderer state.

Rationale:
- Se l'utente accetta un costo API, il valore massimo arriva dalla qualita finale del provider, non da una pipeline ibrida che genera una reference voice e poi la degrada in un motore open-source.
- Questo riduce anche il numero di passaggi fragili: niente runtime clone locale, niente prompt feature caching custom, niente dipendenze GPU per l'utente finale.

Alternative considerate:
- "Usare ElevenLabs solo per creare una reference voice e poi sintetizzare in locale": scartata come default per maggiore complessita e qualita meno prevedibile.
- "Usare solo motori locali": scartata perche non risolve il problema principale segnalato dall'utente, cioe la naturalezza della voce.

### 2. Lasciare il motore macOS come fallback locale stabile

Decisione:
- `system` resta il default iniziale e il fallback universale.
- Il prodotto comunica chiaramente che `system` privilegia disponibilita/offline, mentre `elevenlabs` privilegia qualita.

Rationale:
- Questo preserva l'onboarding zero-config e impedisce che il prodotto diventi inutilizzabile senza credenziali cloud.

Alternative considerate:
- Rendere ElevenLabs il default globale: scartata perche introdurrebbe rete, costi e setup obbligatori.

### 3. Trattare Qwen3-TTS come evaluation track separata

Decisione:
- Qwen3-TTS viene introdotto solo come track sperimentale interna o developer-facing.
- La track include benchmark di qualita, memoria, latenza, install footprint, supporto CPU/MPS/CUDA, e fattibilita packaging.
- Nessuna UI utente finale la presenta come scelta consigliata finche non supera gate definiti.

Rationale:
- Le feature di Qwen3-TTS sono promettenti, soprattutto `voice_design` e `voice_clone`, ma i requisiti reali di deployment sono troppo lontani dal profilo di una desktop app "installa e usa" su Mac eterogenei.

Alternative considerate:
- Adottare subito Qwen al posto di XTTS: scartata per rischio alto su installazione, supporto hardware, dimensione runtime e manutenzione.
- Ignorare Qwen del tutto: scartata perche e il candidato locale piu interessante da misurare rispetto a XTTS.

### 4. Import reference solo da file locali

Decisione:
- Il flusso reference voice accetta file locali audio/video.
- L'app estrae l'audio, normalizza il sample e lo salva in una cartella gestita.
- URL remoti e YouTube non fanno parte del flusso standard.

Rationale:
- Riduce problemi di copyright, affidabilita del downloader, rate limiting e UX fragile.
- Mantiene chiaro il requisito di consenso sulla voce usata.

Alternative considerate:
- Supportare URL YouTube direttamente: scartata come comportamento di prodotto principale.

## Risks / Trade-offs

- [Costo API ElevenLabs] → Mostrare sempre che `elevenlabs` e premium, aggiungere stato connessione e messaggi chiari su consumo/errore provider.
- [Privacy dei contenuti] → Inviare testo e reference solo quando l'utente sceglie esplicitamente il motore cloud; aggiungere copy chiaro sul fatto che il contenuto esce dal dispositivo.
- [Lock-in provider] → Modellare l'integrazione come provider interface astratta per poter aggiungere altri cloud engine in futuro.
- [Qwen troppo pesante per utenti Mac] → Tenerlo fuori dal percorso packaged standard e validarlo solo tramite benchmark e feature flag.
- [Reference audio di bassa qualita] → Aggiungere controlli minimi su durata, rumore, singolo speaker e normalizzazione.
- [Confusione tra motori] → UI con etichette semplici: `Locale`, `Premium`, `Beta`, con descrizione esplicita di compromessi.

## Migration Plan

1. Introdurre il nuovo enum motori con `system`, `elevenlabs`, `xtts`.
2. Rendere `system` il default mantenendo compatibilita con config esistenti.
3. Aggiungere schermata impostazioni provider premium e validazione API key.
4. Inserire import reference locale e routing solo per i motori che lo supportano.
5. Creare benchmark/dev harness per Qwen3-TTS e raccogliere risultati reali su hardware target.
6. Dopo benchmark, decidere se Qwen resta solo track interna, sostituisce XTTS beta, o viene promosso.

Rollback:
- Disabilitare `elevenlabs` via feature flag lasciando `system` e `xtts`.
- La track Qwen non impatta il percorso utente finale, quindi puo essere rimossa senza migrazione utenti.

## Open Questions

- Qual e il target di costo per ora di audio accettabile per il motore premium?
- Vogliamo supportare solo TTS cloud puro o anche speech-to-speech / dubbing in fasi successive?
- Il secure storage dell'API key usera Keychain nativo, `keytar`, o un wrapper gia presente nel progetto?
- Qwen va valutato solo via runtime locale o anche via API DashScope per un confronto piu equo con ElevenLabs?
