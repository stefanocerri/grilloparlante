"""Monta i pezzi di un capitolo: pause diverse secondo il punto del testo, volume uniforme, giunture senza click.

OmniVoice lascia ai bordi di ogni pezzo un silenzio che cambia da pezzo a pezzo (0,2 s circa per lato). Per avere
pause precise qui ogni pezzo viene rifilato alla voce, con un margine fisso, e il silenzio lo aggiungiamo noi.
"""

from __future__ import annotations

import numpy as np

from app.audio.measure import speech_bounds, speech_rms
from app.audio.mp3 import silence
from app.tts.settings import NarrationSettings

# Margine lasciato prima e dopo la voce quando si rifila un pezzo. Largo apposta: le parole che cominciano piano
# (una «s», una «f», un sussurro) stanno sotto la soglia della voce, e con un margine stretto uscivano tagliate.
EDGE_MARGIN = 0.12
# Soglia per trovare i bordi della voce, molto più bassa di quella delle pause: nel dubbio è voce.
EDGE_DB = -55.0
# Un pezzo che finisce con una virgola (frase lunghissima divisa in due) vuole una pausa da virgola.
CLAUSE_PAUSE_FACTOR = 0.5
# Silenzio all'inizio e alla fine del capitolo.
CHAPTER_LEAD = 0.2
CHAPTER_TAIL = 0.6
# Il volume si corregge al massimo di tanto: oltre, più che una frase debole è un pezzo venuto male.
GAIN_RANGE = (0.4, 3.0)
PEAK_LIMIT = 0.97


def pause_after(text: str, ends_paragraph: bool, scene_break: bool, settings: NarrationSettings) -> float:
  """Pausa dopo un pezzo: cambio di scena, fine paragrafo, fine frase o (pezzo che finisce con una virgola) meno."""
  if scene_break:
    return settings.pause_scene
  if ends_paragraph:
    return settings.pause_paragraph
  if settings.precise_pauses and text.rstrip().endswith((",", ";", ":")):
    return settings.pause_sentence * CLAUSE_PAUSE_FACTOR
  return settings.pause_sentence


def level(audio: np.ndarray, sample_rate: int, target_rms: float) -> np.ndarray:
  """Porta il parlato del pezzo al volume di destinazione, senza mai arrivare a fondo scala."""
  if target_rms <= 0 or len(audio) == 0:
    return audio
  current = speech_rms(audio, sample_rate)
  peak = float(np.max(np.abs(audio)))
  if current <= 1e-5 or peak <= 1e-5:
    return audio
  gain = max(GAIN_RANGE[0], min(GAIN_RANGE[1], target_rms / current))
  gain = min(gain, PEAK_LIMIT / peak)
  return (audio * gain).astype(np.float32)


def trim_to_speech(audio: np.ndarray, sample_rate: int, margin: float = EDGE_MARGIN) -> np.ndarray:
  """Toglie il silenzio ai bordi lasciando `margin` secondi per lato."""
  bounds = speech_bounds(audio, sample_rate, EDGE_DB)
  if bounds is None:
    return audio  # nessuna voce trovata: meglio non toccare
  start = max(0, int((bounds[0] - margin) * sample_rate))
  end = min(len(audio), int((bounds[1] + margin) * sample_rate))
  return audio[start:end]


def _pad_to_margin(audio: np.ndarray, sample_rate: int, margin: float) -> np.ndarray:
  """Se ai bordi c'è meno silenzio del margine (la voce arriva fino in fondo), lo aggiunge: la dissolvenza
  non deve mai cadere sulla voce."""
  bounds = speech_bounds(audio, sample_rate, EDGE_DB)
  if bounds is None:
    return audio
  before = max(0.0, margin - bounds[0])
  after = max(0.0, margin - (len(audio) / sample_rate - bounds[1]))
  return np.concatenate([silence(before, sample_rate), audio, silence(after, sample_rate)])


def fade_edges(audio: np.ndarray, sample_rate: int, seconds: float) -> np.ndarray:
  count = min(int(seconds * sample_rate), len(audio) // 2)
  if count <= 0:
    return audio
  faded = np.array(audio, dtype=np.float32, copy=True)
  ramp = np.linspace(0.0, 1.0, count, dtype=np.float32)
  faded[:count] *= ramp
  faded[-count:] *= ramp[::-1]
  return faded


def join_pieces(pieces: list[tuple[np.ndarray, float]], settings: NarrationSettings, sample_rate: int) -> np.ndarray:
  """Unisce i pezzi di un capitolo. Ogni elemento è (audio, pausa da mettere dopo)."""
  if not pieces:
    return np.zeros(1, dtype=np.float32)
  parts: list[np.ndarray] = []
  if not settings.precise_pauses:
    # Montaggio di prima: i pezzi così come sono, con il silenzio fisso dopo ognuno.
    for audio, pause in pieces:
      parts.append(level(audio, sample_rate, settings.level_rms))
      parts.append(silence(pause, sample_rate))
    return np.concatenate(parts)

  parts.append(silence(CHAPTER_LEAD, sample_rate))
  for position, (audio, pause) in enumerate(pieces):
    audio = trim_to_speech(level(audio, sample_rate, settings.level_rms), sample_rate)
    audio = _pad_to_margin(audio, sample_rate, EDGE_MARGIN)
    parts.append(fade_edges(audio, sample_rate, settings.edge_fade))
    last = position == len(pieces) - 1
    # Il margine dei due pezzi vicini è già silenzio: si toglie dalla pausa.
    gap = CHAPTER_TAIL if last else max(0.0, pause - 2 * EDGE_MARGIN)
    parts.append(silence(gap, sample_rate))
  return np.concatenate(parts)
