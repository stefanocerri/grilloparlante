from __future__ import annotations

from pathlib import Path

import numpy as np

# Parlato mono: 48 kbps a 24 kHz e circa 21 MB per ora di audio, qualita piu che sufficiente.
MP3_BITRATE_KBPS = 48


def to_int16(audio: np.ndarray) -> np.ndarray:
  clipped = np.clip(np.asarray(audio, dtype=np.float32), -1.0, 1.0)
  return (clipped * 32767.0).astype("<i2")


def silence(seconds: float, sample_rate: int) -> np.ndarray:
  return np.zeros(int(round(seconds * sample_rate)), dtype=np.float32)


def write_mp3(audio: np.ndarray, sample_rate: int, destination: Path) -> float:
  """Codifica audio mono float32 in MP3 e restituisce la durata in secondi."""
  import lameenc

  encoder = lameenc.Encoder()
  encoder.set_bit_rate(MP3_BITRATE_KBPS)
  encoder.set_in_sample_rate(sample_rate)
  encoder.set_channels(1)
  encoder.set_quality(2)
  data = encoder.encode(to_int16(audio).tobytes()) + encoder.flush()

  destination.parent.mkdir(parents=True, exist_ok=True)
  partial = destination.with_suffix(destination.suffix + ".part")
  partial.write_bytes(data)
  partial.replace(destination)
  return float(len(audio)) / float(sample_rate)
