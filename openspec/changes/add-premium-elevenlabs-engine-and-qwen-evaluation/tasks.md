## 1. Engine model and routing

- [ ] 1.1 Estendere il modello `tts.engine` per includere `elevenlabs` e distinguere chiaramente i motori stabili da quelli sperimentali.
- [ ] 1.2 Aggiornare il routing backend/frontend in modo che la conversione si blocchi solo per il motore attualmente selezionato.
- [ ] 1.3 Aggiornare manifest, log e result payload per riportare il motore realmente usato nella conversione.

## 2. Premium provider integration

- [ ] 2.1 Introdurre un adapter backend per ElevenLabs con input text, voice selection, gestione errori e output audio compatibile con la pipeline attuale.
- [ ] 2.2 Implementare il salvataggio sicuro dell'API key lato desktop e impedire che il renderer la gestisca in chiaro.
- [ ] 2.3 Aggiungere controlli di connettivita, auth e quota con messaggi espliciti in UI e nei log conversione.

## 3. Voice settings and UX

- [ ] 3.1 Aggiornare il pannello impostazioni per mostrare `Locale`, `Premium`, `Beta` con copy su qualita, costi, privacy e affidabilita.
- [ ] 3.2 Aggiungere setup provider premium, stato configurazione e scelta voce cloud.
- [ ] 3.3 Aggiornare il pannello runtime per non interferire con i motori non selezionati e per spiegare bene le limitazioni delle modalita beta.

## 4. Reference voice import

- [ ] 4.1 Aggiungere un flusso di import locale per file audio/video da usare come reference voice.
- [ ] 4.2 Estrarre e normalizzare il sample reference in un asset gestito dall'app con controlli minimi di validita.
- [ ] 4.3 Aggiungere conferma esplicita di consenso/diritto d'uso prima di utilizzare una voce importata.

## 5. Qwen evaluation track

- [x] 5.1 Creare un harness di benchmark separato per Qwen3-TTS con feature flag o comando developer-only.
- [x] 5.2 Registrare metriche minime di valutazione: variante modello, hardware, footprint, cold start, latenza, esito installazione e stabilita.
- [x] 5.3 Documentare i gate di promozione o esclusione di Qwen rispetto a XTTS e al motore premium.

## 6. Verification and docs

- [ ] 6.1 Aggiungere test di routing motori e casi di errore provider premium.
- [ ] 6.2 Aggiornare README e documentazione setup con privacy note, costi attesi e flussi supportati.
- [ ] 6.3 Eseguire una matrice di smoke test su conversione locale, conversione premium e import reference da file.
