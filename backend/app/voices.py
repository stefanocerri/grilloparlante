from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

VOICES_DIR = Path(__file__).resolve().parents[1] / "voices"


def user_voices_dir() -> Path | None:
  """Voci create dall'utente da un campione: la cartella la passa l'app (GRILLO_USER_VOICES_DIR)."""
  value = os.getenv("GRILLO_USER_VOICES_DIR", "").strip()
  return Path(value) if value else None


@dataclass(frozen=True)
class Voice:
  id: str
  name: str
  gender: str
  description: str
  sample_path: Path
  transcript: str
  preview_path: Path | None
  custom: bool = False


def _entries(directory: Path) -> list[dict]:
  try:
    return json.loads((directory / "voices.json").read_text(encoding="utf-8"))
  except (OSError, ValueError):
    return []


def list_voices() -> list[Voice]:
  sources = [(VOICES_DIR, False)]
  user_dir = user_voices_dir()
  if user_dir:
    sources.append((user_dir, True))
  voices: list[Voice] = []
  for directory, custom in sources:
    voices.extend(_voices_in(directory, custom))
  return voices


def _voices_in(directory: Path, custom: bool) -> list[Voice]:
  voices: list[Voice] = []
  for entry in _entries(directory):
    sample = directory / f"{entry['id']}.wav"
    transcript = directory / f"{entry['id']}.txt"
    preview = directory / f"{entry['id']}.preview.mp3"
    if not sample.exists() or not transcript.exists():
      continue
    voices.append(
      Voice(
        id=entry["id"],
        name=entry["name"],
        gender=entry.get("gender", "altro"),
        description=entry.get("description", ""),
        sample_path=sample,
        transcript=transcript.read_text(encoding="utf-8").strip(),
        preview_path=preview if preview.exists() else None,
        custom=custom,
      )
    )
  return voices


def get_voice(voice_id: str) -> Voice:
  for voice in list_voices():
    if voice.id == voice_id:
      return voice
  available = ", ".join(v.id for v in list_voices())
  raise ValueError(f"Voce sconosciuta: {voice_id}. Disponibili: {available}")
