"""Tutte le impostazioni della lettura in un posto solo: pezzi, pause, parametri di OmniVoice, rifinitura.

Ci sono due profili:
- NATURALE, per le voci incluse nell'app: pezzi a misura di frase, durata calcolata da noi, pause diverse tra frase,
  paragrafo e cambio di scena, volume uniforme, controllo dei pezzi venuti male;
- CLASSICO, per le voci create dall'utente da un campione: esattamente la lettura di prima. Una di quelle voci suona
  già bene così, e non potendola riascoltare a ogni modifica non la tocchiamo.

Per provare il profilo naturale anche sulle voci dell'utente: GRILLO_PROFILO=naturale.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import asdict, dataclass, replace

from app.voices import Voice


@dataclass(frozen=True)
class NarrationSettings:
  name: str
  # --- Divisione del testo
  chunk_chars: int             # lunghezza massima di un pezzo
  min_chunk_chars: int         # sotto questa lunghezza un pezzo si unisce al vicino (0 = regola di prima)
  sentence_chunks: bool        # pezzi a fine frase, paragrafi mai incollati senza pausa
  extended_cleanup: bool       # abbreviazioni, simboli, date, numeri romani… scritti come si leggono
  # --- Voce
  preprocess_prompt: bool      # True: OmniVoice accorcia le pause del campione prima di misurarne la velocità
  own_duration: bool           # True: la durata di ogni pezzo la calcoliamo noi (velocità e pause del campione)
  duration_stretch: float      # ritocco alla durata calcolata (1.05 = 5% di tempo in più)
  num_step: int
  guidance_scale: float
  t_shift: float
  class_temperature: float
  position_temperature: float
  # --- Pause. Con precise_pauses sono il silenzio totale tra una voce e la successiva; senza, il silenzio
  #     aggiunto tra due pezzi (a cui OmniVoice somma circa 0,2 s per lato).
  precise_pauses: bool
  pause_sentence: float        # tra due pezzi dello stesso paragrafo
  pause_paragraph: float       # a fine paragrafo
  pause_title: float           # dopo il titolo del capitolo
  pause_scene: float           # cambio di scena (***)
  # --- Rifinitura
  level_rms: float             # volume del parlato a cui portare ogni pezzo (0 = non toccare)
  edge_fade: float             # dissolvenza alle giunture, in secondi (0 = nessuna)
  check_quality: bool          # rigenera una volta i pezzi venuti male

  @property
  def label(self) -> str:
    """Etichetta per la cache dei pezzi: cambia quando cambia un'impostazione che cambia l'audio."""
    digest = hashlib.sha1(json.dumps(asdict(self), sort_keys=True).encode("utf-8")).hexdigest()[:10]
    return f"{self.name}-{digest}"

  def generation_kwargs(self) -> dict:
    return {
      "num_step": self.num_step,
      "guidance_scale": self.guidance_scale,
      "t_shift": self.t_shift,
      "class_temperature": self.class_temperature,
      "position_temperature": self.position_temperature,
    }


# La lettura di prima: valori di default di OmniVoice, pezzi da 600 caratteri, 0,35 s tra un pezzo e l'altro.
CLASSICO = NarrationSettings(
  name="classico",
  chunk_chars=600,
  min_chunk_chars=0,
  sentence_chunks=False,
  extended_cleanup=False,
  preprocess_prompt=True,
  own_duration=False,
  duration_stretch=1.0,
  num_step=32,
  guidance_scale=2.0,
  t_shift=0.1,
  class_temperature=0.0,
  position_temperature=5.0,
  precise_pauses=False,
  pause_sentence=0.35,
  pause_paragraph=0.35,
  pause_title=1.0,
  pause_scene=0.35,
  level_rms=0.0,
  edge_fade=0.0,
  check_quality=False,
)

NATURALE = NarrationSettings(
  name="naturale",
  # ~15-18 s di parlato: sotto i 30 s oltre i quali OmniVoice ridivide il testo per conto suo.
  chunk_chars=280,
  # Sui pezzi corti la voce aggiunge suoni o parole del campione: meglio unirli al vicino.
  min_chunk_chars=120,
  sentence_chunks=True,
  extended_cleanup=True,
  preprocess_prompt=False,
  own_duration=True,
  # Più tempo non rallenta le parole: provato 1,08 e 1,15 su stella e brando, crescono solo le pause (fino a 1 s).
  duration_stretch=1.0,
  num_step=48,
  # Parametri provati uno alla volta su stella, brando e chiara notizie (guidance 1,5/2,5, t_shift 0,3,
  # class_temperature 0,2, position_temperature 3): t_shift 0,3 è peggiore (più errori, parole più veloci), gli
  # altri stanno dentro il rumore di una sola lettura. Restano i valori di OmniVoice finché l'ascolto non dice altro.
  guidance_scale=2.0,
  t_shift=0.1,
  class_temperature=0.0,
  position_temperature=5.0,
  precise_pauses=True,
  # Nei campioni inclusi la pausa dopo un punto dura in media mezzo secondo (0,25-0,8).
  pause_sentence=0.6,
  pause_paragraph=1.0,
  pause_title=1.4,
  pause_scene=1.9,
  level_rms=0.1,
  edge_fade=0.015,
  check_quality=True,
)

PROFILES = {"classico": CLASSICO, "naturale": NATURALE}


def _env_number(name: str, cast, minimum, maximum):
  raw = os.getenv(name, "").strip()
  if not raw:
    return None
  try:
    value = cast(raw)
  except ValueError:
    return None
  return max(minimum, min(maximum, value))


def settings_for(voice: Voice) -> NarrationSettings:
  """Impostazioni per una voce: naturale per quelle incluse, classico per quelle create dall'utente."""
  forced = os.getenv("GRILLO_PROFILO", "").strip().lower()
  settings = PROFILES.get(forced) or (CLASSICO if voice.custom else NATURALE)
  overrides = {
    "num_step": _env_number("GRILLO_NUM_STEP", int, 4, 128),
    "guidance_scale": _env_number("GRILLO_GUIDANCE", float, 0.0, 6.0),
  }
  overrides = {key: value for key, value in overrides.items() if value is not None}
  return replace(settings, **overrides) if overrides else settings
