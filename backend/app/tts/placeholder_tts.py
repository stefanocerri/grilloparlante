from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

from app.tts.base import TtsAdapter


class PlaceholderTtsAdapter(TtsAdapter):
  engine_name = "placeholder"

  def synthesize(self, text: str, output_path: Path, settings: dict) -> list[str]:
    sample_rate = 22050
    speed = float(settings["tts"].get("speakingSpeed", 1.0) or 1.0)
    duration = max(0.6, min(2.8, len(text) / 220.0)) / max(0.7, speed)
    total_frames = int(sample_rate * duration)
    frequency = 220.0

    with wave.open(str(output_path), "wb") as handle:
      handle.setnchannels(1)
      handle.setsampwidth(2)
      handle.setframerate(sample_rate)

      frames = bytearray()
      for index in range(total_frames):
        envelope = min(1.0, index / 1200.0, (total_frames - index) / 1200.0)
        sample = math.sin(2 * math.pi * frequency * (index / sample_rate))
        value = int(sample * envelope * 0.18 * 32767)
        frames.extend(struct.pack("<h", value))
      handle.writeframes(bytes(frames))

    return [
      "Il motore voce gestito non era disponibile, quindi e stato generato un WAV placeholder per mantenere eseguibile la pipeline."
    ]
