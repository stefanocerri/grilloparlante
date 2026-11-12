# Voci di riferimento

Campioni usati per clonare la voce con OmniVoice (o Chatterbox). Ogni `.wav` ha accanto
il `.txt` con il testo esatto letto nel campione, che rende la clonazione più precisa.

| Voce | Origine | Licenza |
|---|---|---|
| `uomo_01` | Lettore LibriVox 7372, Pirandello, *Novelle per un anno* vol. 7 | Registrazione LibriVox di pubblico dominio, tramite Multilingual LibriSpeech (CC-BY 4.0) |
| `donna_e` | Voce sintetica creata con OmniVoice ("female, elderly, low pitch") | Output di OmniVoice, pesi CC-BY-NC: solo uso non commerciale |
| `brando`, `chiara`, `cornelia`, `dimitri`, `edoardo` e le varianti `*_notizie` | Voci sintetiche generate con ElevenLabs (piano Starter), una registrazione per voce divisa in due: racconto e notiziario | Output ElevenLabs con licenza commerciale del piano Starter |

Fonti originali:
- `uomo_01`: http://www.archive.org/download/novelle_per_anno_7_1208_librivox/novelle07_03_pirandello_64kb.mp3
- Multilingual LibriSpeech: https://huggingface.co/datasets/facebook/multilingual_librispeech

I campioni LibriVox sono a 16 kHz, quelli sintetici a 24 kHz.

Le voci ElevenLabs hanno due campioni ciascuna: `<nome>.wav` legge un brano di racconto (tono da audiolibro),
`<nome>_notizie.wav` un brano da notiziario (tono da lettura di notizie e articoli).

Prova rapida:

```bash
python backend/runtime/voice_compare.py --engines omnivoice \
  --reference backend/voices/uomo_01.wav --reference-text-file backend/voices/uomo_01.txt
```
