from __future__ import annotations

import json
import os
from dataclasses import dataclass, replace
from pathlib import Path

VOICES_DIR = Path(__file__).resolve().parents[1] / "voices"
# Per questi tipi di contenuto si usa il campione da notiziario (<id>.notizie.wav), se la voce ce l'ha.
NEWS_KINDS = ("articolo", "notiziario")


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
  # Secondo campione, letto con tono da notiziario: lo usano articoli e notiziari.
  news_sample_path: Path | None = None
  news_transcript: str | None = None

  def for_kind(self, kind: str | None) -> "Voice":
    """La stessa voce con il campione adatto al tipo di contenuto: notiziario per articoli e notizie."""
    if kind in NEWS_KINDS and self.news_sample_path and self.news_transcript:
      return replace(self, sample_path=self.news_sample_path, transcript=self.news_transcript)
    return self


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
    news_sample = directory / f"{entry['id']}.notizie.wav"
    news_transcript = directory / f"{entry['id']}.notizie.txt"
    has_news = news_sample.exists() and news_transcript.exists()
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
        news_sample_path=news_sample if has_news else None,
        news_transcript=news_transcript.read_text(encoding="utf-8").strip() if has_news else None,
      )
    )
  return voices


def get_voice(voice_id: str) -> Voice:
  for voice in list_voices():
    if voice.id == voice_id:
      return voice
  available = ", ".join(v.id for v in list_voices())
  raise ValueError(f"Voce sconosciuta: {voice_id}. Disponibili: {available}")
