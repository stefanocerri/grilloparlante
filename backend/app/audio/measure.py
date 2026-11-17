"""Misure sull'audio fatte solo con numpy: dove c'è voce, dove ci sono pause, quanto è forte il parlato.

Servono a tre cose: stimare la durata giusta di ogni pezzo (velocità e pause del campione), montare i pezzi con
pause precise e controllare i pezzi venuti male.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

FRAME_SECONDS = 0.01
# Sotto questa soglia (rispetto ai punti più forti del parlato) è silenzio: respiri e code di riverbero compresi.
SILENCE_DB = -38.0
# Una pausa vera dura almeno così; sotto sono le chiusure delle consonanti («t», «p», «c»).
MIN_PAUSE_SECONDS = 0.14


@dataclass(frozen=True)
class SpeechProfile:
  """Come è distribuito il parlato in un audio."""

  seconds: float            # durata totale
  lead: float               # silenzio iniziale
  trail: float              # silenzio finale
  pauses: tuple[tuple[float, float], ...]  # pause interne (inizio, fine) in secondi

  @property
  def pause_seconds(self) -> float:
    return sum(end - start for start, end in self.pauses)

  @property
  def speech_seconds(self) -> float:
    """Tempo in cui si parla davvero: senza silenzi ai bordi e senza pause."""
    return max(0.0, self.seconds - self.lead - self.trail - self.pause_seconds)

  @property
  def longest_pause(self) -> float:
    return max((end - start for start, end in self.pauses), default=0.0)


def _frame_rms(audio: np.ndarray, sample_rate: int) -> np.ndarray:
  hop = max(1, int(FRAME_SECONDS * sample_rate))
  count = len(audio) // hop
  if count == 0:
    return np.zeros(0, dtype=np.float32)
  frames = np.asarray(audio[: count * hop], dtype=np.float32).reshape(count, hop)
  return np.sqrt(np.mean(frames * frames, axis=1))


def voiced_frames(audio: np.ndarray, sample_rate: int, silence_db: float = SILENCE_DB) -> np.ndarray:
  """Per ogni finestra da 10 ms, True se c'è voce."""
  rms = _frame_rms(audio, sample_rate)
  if rms.size == 0:
    return np.zeros(0, dtype=bool)
  loud = float(np.percentile(rms, 95))
  threshold = max(loud * 10 ** (silence_db / 20), 1e-4)
  return rms > threshold


def speech_bounds(audio: np.ndarray, sample_rate: int, silence_db: float) -> tuple[float, float] | None:
  """Inizio e fine della voce in secondi, con la soglia data; None se non c'è voce."""
  indices = np.flatnonzero(voiced_frames(audio, sample_rate, silence_db))
  if indices.size == 0:
    return None
  return int(indices[0]) * FRAME_SECONDS, (int(indices[-1]) + 1) * FRAME_SECONDS


def speech_profile(audio: np.ndarray, sample_rate: int, min_pause: float = MIN_PAUSE_SECONDS) -> SpeechProfile:
  voiced = voiced_frames(audio, sample_rate)
  seconds = len(audio) / float(sample_rate)
  indices = np.flatnonzero(voiced)
  if indices.size == 0:
    return SpeechProfile(seconds=seconds, lead=seconds, trail=0.0, pauses=())
  first, last = int(indices[0]), int(indices[-1])
  pauses: list[tuple[float, float]] = []
  # i buchi tra una finestra con voce e la successiva
  gaps = np.flatnonzero(np.diff(indices) > 1)
  for gap in gaps:
    start, end = int(indices[gap]) + 1, int(indices[gap + 1])
    if (end - start) * FRAME_SECONDS >= min_pause:
      pauses.append((start * FRAME_SECONDS, end * FRAME_SECONDS))
  return SpeechProfile(
    seconds=seconds,
    lead=first * FRAME_SECONDS,
    trail=max(0.0, seconds - (last + 1) * FRAME_SECONDS),
    pauses=tuple(pauses),
  )


def speech_rms(audio: np.ndarray, sample_rate: int) -> float:
  """Volume del solo parlato (RMS delle finestre con voce): le pause non lo abbassano."""
  rms = _frame_rms(audio, sample_rate)
  voiced = voiced_frames(audio, sample_rate)
  if not voiced.any():
    return 0.0
  return float(np.sqrt(np.mean(rms[voiced] ** 2)))


def clipped_fraction(audio: np.ndarray) -> float:
  """Quota di campioni a fondo scala: sopra lo zero virgola si sente gracchiare."""
  if len(audio) == 0:
    return 0.0
  return float(np.mean(np.abs(audio) >= 0.999))
