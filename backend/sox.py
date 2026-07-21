from __future__ import annotations

import numpy as np


class Transformer:
  def __init__(self) -> None:
    self._target_db_level = -6.0

  def norm(self, db_level: float = -6.0) -> "Transformer":
    self._target_db_level = float(db_level)
    return self

  def build_array(self, input_array, sample_rate_in: int = 16000):
    del sample_rate_in

    audio = np.asarray(input_array, dtype=np.float32)
    if audio.ndim > 1:
      audio = np.mean(audio, axis=-1)

    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak <= 0.0:
      return audio

    target_peak = 10 ** (self._target_db_level / 20.0)
    gain = target_peak / peak
    normalized = np.clip(audio * gain, -1.0, 1.0)
    return normalized.astype(np.float32)
