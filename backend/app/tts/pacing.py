"""Quanto deve durare un pezzo di testo letto da una certa voce.

OmniVoice non genera una parola dopo l'altra: prima decide quanti secondi durerà l'audio, poi li riempie. Se i
secondi sono pochi le parole escono attaccate. La sua stima conta i caratteri e dà alla punteggiatura mezzo
carattere (30 ms circa): una frase piena di virgole o un dialogo non ricevono il tempo per le pause.

Qui la stima è fatta in due parti, tutte e due misurate sul campione della voce:
- il parlato: lettere del testo / lettere al secondo del campione (pause escluse);
- le pause: un tempo per ogni segno di punteggiatura, in proporzione a quanto quella voce si ferma davvero.
Per costruzione, il testo del campione riceve esattamente la durata del campione.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np

from app.audio.measure import speech_profile

# Pausa di partenza per ogni segno, in secondi; poi si adatta alla voce (VoicePace.pause_scale).
PAUSE_COMMA = 0.2
PAUSE_SEMICOLON = 0.3
PAUSE_PERIOD = 0.4
PAUSE_QUESTION = 0.4
PAUSE_ELLIPSIS = 0.5
# Quanto in più, rispetto al punto, quando dentro un pezzo finisce un paragrafo.
PAUSE_PARAGRAPH_EXTRA = 0.3
# Una voce può fermarsi da metà a una volta e mezza le pause di partenza: oltre è un difetto della misura.
PAUSE_SCALE_RANGE = (0.5, 1.6)
# Lettere al secondo plausibili per l'italiano letto: fuori da qui il campione è stato misurato male.
RATE_RANGE = (8.0, 20.0)
DEFAULT_RATE = 13.0
# Sotto i 2 secondi OmniVoice allunga la durata (stessa curva della sua stima): i pezzi cortissimi vengono male.
SHORT_SECONDS = 2.0
# Silenzio che OmniVoice lascia ai bordi di ogni pezzo, dentro la durata chiesta (misurato: 0,15-0,2 s per lato).
EDGE_SECONDS = 0.3

# Un segno di pausa conta solo se dopo c'è uno spazio (o virgolette chiuse e poi spazio): non l'apostrofo, non
# il punto dentro una sigla.
_PAUSE_MARK = re.compile(r"([,;:]|[.!?…]+)[»”\"')\]]*(\s+)(?=\S)")
_LETTER = re.compile(r"[^\W\d_]")
_DIGIT = re.compile(r"\d")


@dataclass(frozen=True)
class VoicePace:
  letters_per_second: float = DEFAULT_RATE
  pause_scale: float = 1.0


def letter_count(text: str) -> float:
  """Peso del parlato: una lettera vale uno, una cifra rimasta nel testo circa tre lettere."""
  return len(_LETTER.findall(text)) + 3.0 * len(_DIGIT.findall(text))


def pause_seconds(text: str) -> float:
  """Somma delle pause di partenza dentro il testo. L'ultimo segno non conta: lì il pezzo finisce."""
  total = 0.0
  for match in _PAUSE_MARK.finditer(text.strip()):
    mark = match.group(1)
    if mark == ",":
      total += PAUSE_COMMA
    elif mark in ";:":
      total += PAUSE_SEMICOLON
    elif "…" in mark or len(mark) >= 3:
      total += PAUSE_ELLIPSIS
    elif "?" in mark or "!" in mark:
      total += PAUSE_QUESTION
    else:
      total += PAUSE_PERIOD
    if "\n" in match.group(2):
      total += PAUSE_PARAGRAPH_EXTRA
  return total


def voice_pace(audio: np.ndarray, sample_rate: int, transcript: str) -> VoicePace:
  """Velocità e pause di una voce, misurate sul suo campione."""
  profile = speech_profile(audio, sample_rate)
  spoken = profile.seconds - profile.lead - profile.trail
  letters = letter_count(transcript)
  if spoken <= 1.0 or letters < 20:
    return VoicePace()
  nominal = pause_seconds(transcript)
  low, high = PAUSE_SCALE_RANGE
  scale = max(low, min(high, profile.pause_seconds / nominal)) if nominal > 0 else 1.0
  # Il tempo che non è pausa è parlato: così il testo del campione ritrova la durata del campione.
  speaking = spoken - scale * nominal
  if speaking <= 0:
    return VoicePace()
  rate = max(RATE_RANGE[0], min(RATE_RANGE[1], letters / speaking))
  return VoicePace(letters_per_second=rate, pause_scale=scale)


def estimate_seconds(text: str, pace: VoicePace, speed: float = 1.0) -> float:
  """Durata da chiedere a OmniVoice per questo testo; `speed` è la velocità scelta dall'utente per il libro."""
  seconds = spoken_seconds(text, pace, speed)
  if 0 < seconds < SHORT_SECONDS:
    seconds = SHORT_SECONDS * (seconds / SHORT_SECONDS) ** (1.0 / 3.0)
  # Dentro la durata OmniVoice mette anche un po' di silenzio prima e dopo la voce, come nel campione.
  return max(seconds, 0.2) + EDGE_SECONDS


def spoken_seconds(text: str, pace: VoicePace, speed: float = 1.0) -> float:
  """Durata attesa dalla prima all'ultima parola, pause comprese e silenzi ai bordi esclusi."""
  seconds = letter_count(text) / pace.letters_per_second + pace.pause_scale * pause_seconds(text)
  return seconds / speed if speed > 0 else seconds
