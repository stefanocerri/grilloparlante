from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

VOICES_DIR = Path(__file__).resolve().parents[1] / "voices"


@dataclass(frozen=True)
class Voice:
  id: str
  name: str
  gender: str
  description: str
  sample_path: Path
  transcript: str
  preview_path: Path | None


def list_voices() -> list[Voice]:
  entries = json.loads((VOICES_DIR / "voices.json").read_text(encoding="utf-8"))
  voices: list[Voice] = []
  for entry in entries:
    sample = VOICES_DIR / f"{entry['id']}.wav"
    transcript = VOICES_DIR / f"{entry['id']}.txt"
    preview = VOICES_DIR / f"{entry['id']}.preview.mp3"
    if not sample.exists() or not transcript.exists():
      continue
    voices.append(
      Voice(
        id=entry["id"],
        name=entry["name"],
        gender=entry["gender"],
        description=entry.get("description", ""),
        sample_path=sample,
        transcript=transcript.read_text(encoding="utf-8").strip(),
        preview_path=preview if preview.exists() else None,
      )
    )
  return voices


def get_voice(voice_id: str) -> Voice:
  for voice in list_voices():
    if voice.id == voice_id:
      return voice
  available = ", ".join(v.id for v in list_voices())
  raise ValueError(f"Voce sconosciuta: {voice_id}. Disponibili: {available}")
