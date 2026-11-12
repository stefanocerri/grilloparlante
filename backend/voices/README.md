# Voci di riferimento

Campioni usati per clonare la voce con OmniVoice (o Chatterbox). Ogni `.wav` ha accanto
il `.txt` con il testo esatto letto nel campione, che rende la clonazione più precisa.

| Voce | Origine | Licenza |
|---|---|---|
| tutte (`brando`, `chiara`, `cornelia`, `dimitri`, `edoardo`, `gianluigi`, `morgaine`, `nick`, `serena`, `stella`, `valentina`, `vito`) | Voci sintetiche generate con ElevenLabs (piano Starter), una registrazione per voce divisa in due: racconto e notiziario | Output ElevenLabs con licenza commerciale del piano Starter |

I campioni sono WAV mono a 24 kHz.

Una voce può avere due campioni: `<id>.wav` / `<id>.txt` con un brano di racconto, usato per libri e documentazione,
e `<id>.notizie.wav` / `<id>.notizie.txt` con un brano da notiziario, usato per articoli e notiziari. Nell'elenco
resta una voce sola: il campione lo sceglie la conversione in base al tipo di contenuto. Tutte le voci incluse li hanno
entrambi.

Prova rapida:

```bash
python backend/runtime/voice_compare.py --engines omnivoice \
  --reference backend/voices/brando.wav --reference-text-file backend/voices/brando.txt
```
