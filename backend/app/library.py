"""Libreria locale: una cartella per libro con book.json, copertina e un MP3 per capitolo.

books/<book_id>/
  book.json          scheda del libro (letta dall'app)
  cover.jpg|png      copertina, se il PDF ne ha una
  text/001.txt       testo pulito di ogni capitolo
  chapters/001.mp3   audio dei capitoli convertiti
  work/              pezzi WAV intermedi (cancellati a capitolo finito) e impostazioni.txt, con cui sono stati fatti
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.utils.files import slugify


def now_iso() -> str:
  return datetime.now(timezone.utc).isoformat()


def file_fingerprint(path: Path) -> str:
  digest = hashlib.sha1()
  with path.open("rb") as handle:
    while chunk := handle.read(1 << 20):
      digest.update(chunk)
  return digest.hexdigest()


def make_book_id(title: str, source: Path, voice_id: str, speed: float) -> str:
  """Stesso PDF + stessa voce + stessa velocita = stesso libro: la conversione riprende."""
  key = f"{file_fingerprint(source)}|{voice_id}|{speed:.2f}"
  return f"{slugify(title, max_length=40)}-{hashlib.sha1(key.encode()).hexdigest()[:8]}"


class BookStore:
  def __init__(self, library_dir: Path, book_id: str) -> None:
    self.dir = library_dir / "books" / book_id
    self.path = self.dir / "book.json"
    self.chapters_dir = self.dir / "chapters"
    self.work_dir = self.dir / "work"

  def exists(self) -> bool:
    return self.path.exists()

  def load(self) -> dict[str, Any]:
    return json.loads(self.path.read_text(encoding="utf-8"))

  def save(self, book: dict[str, Any]) -> None:
    self.dir.mkdir(parents=True, exist_ok=True)
    book["updatedAt"] = now_iso()
    chapters = book.get("chapters", [])
    ready = sum(1 for chapter in chapters if chapter.get("status") == "ready")
    book["readyChapters"] = ready
    book["status"] = "ready" if chapters and ready == len(chapters) else "partial" if ready else "new"
    book["totalDuration"] = round(
      sum(chapter.get("duration") or 0 for chapter in book.get("chapters", [])), 2
    )
    partial = self.path.with_suffix(".json.part")
    partial.write_text(json.dumps(book, ensure_ascii=False, indent=2), encoding="utf-8")
    partial.replace(self.path)

  def text_file(self, index: int) -> Path:
    return self.dir / "text" / f"{index:03d}.txt"

  def chapter_file(self, index: int) -> Path:
    return self.chapters_dir / f"{index:03d}.mp3"

  def chunk_file(self, index: int, part: int) -> Path:
    return self.work_dir / f"{index:03d}-{part:04d}.wav"
