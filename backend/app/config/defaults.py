from __future__ import annotations

from copy import deepcopy
from pathlib import Path

DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[3] / "output"

DEFAULT_SETTINGS = {
  "outputDir": str(DEFAULT_OUTPUT_DIR),
  "chunkSize": 1200,
  "mergeByChapter": True,
  "keepTempFiles": False,
  "preferredAudioFormat": "mp3",
  "tts": {
    "engine": "supertonic",
    "language": "auto",
    "voiceMode": "standard",
    "voiceName": "Voce preset",
    "voiceStyle": "F1",
    "voiceStylePath": "",
    "qualitySteps": 8,
    "speakingSpeed": 1.0,
    "referenceAudioPath": "",
    "referenceText": ""
  }
}


def merge_settings(raw: dict | None) -> dict:
  settings = deepcopy(DEFAULT_SETTINGS)

  if not raw:
    return settings

  for key, value in raw.items():
    if key == "tts" and isinstance(value, dict):
      settings["tts"].update(value)
    else:
      settings[key] = value

  if not settings["outputDir"]:
    settings["outputDir"] = str(DEFAULT_OUTPUT_DIR)

  return settings
