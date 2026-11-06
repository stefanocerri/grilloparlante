"""Passo 2: converte in audio i capitoli scelti di un libro gia importato.

Ogni capitolo diventa chapters/NNN.mp3. I pezzi intermedi restano in work/ finche il
capitolo non e finito: se l'app si chiude a meta, la conversione riparte da li.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Callable

import numpy as np

from app.audio.mp3 import silence, write_mp3
from app.chunking.chunker import chunk_chapters
from app.jobs.models import Chapter
from app.library import BookStore
from app.tts.omnivoice_engine import SAMPLE_RATE, OmniVoiceEngine
from app.utils.events import EventEmitter
from app.utils.files import slugify
from app.voices import get_voice

CHUNK_CHARS = 600  # ~30-40 s di parlato per pezzo
PAUSE_BETWEEN_CHUNKS = 0.35
PAUSE_AFTER_TITLE = 1.0


class JobCancelled(Exception):
  pass


class ConversionJob:
  def __init__(
    self,
    book_id: str,
    chapters: list[int],
    library_dir: str,
    emitter: EventEmitter,
    is_cancelled: Callable[[], bool],
  ) -> None:
    self.store = BookStore(Path(library_dir).expanduser().resolve(), book_id)
    if not self.store.exists():
      raise RuntimeError(f"Libro non trovato: {book_id}")
    self.book = self.store.load()
    self.requested = sorted(set(chapters))
    self.emitter = emitter
    self.is_cancelled = is_cancelled

  def run(self) -> dict:
    book = self.book
    entries = {entry["index"]: entry for entry in book["chapters"]}
    todo = [
      entries[index]
      for index in self.requested
      if index in entries and not (entries[index]["status"] == "ready" and self.store.chapter_file(index).exists())
    ]
    if not todo:
      self.emitter.log("info", "I capitoli scelti sono gia pronti")
      return self._finish()

    voice = get_voice(book["voice"]["id"])
    engine = OmniVoiceEngine(voice, book.get("speed", 1.0), log=lambda m: self.emitter.log("info", m))
    total_chars = sum(entry["chars"] for entry in todo) or 1
    done_chars = 0
    session = {"chars": 0, "started": time.monotonic()}

    for position, entry in enumerate(todo, start=1):
      self._ensure_not_cancelled()
      chapter = Chapter(
        id=f"chapter-{entry['index']:03d}",
        title=entry["title"],
        text=self.store.text_file(entry["index"]).read_text(encoding="utf-8"),
      )
      entry["status"] = "converting"
      self.store.save(book)
      label = f"Capitolo {entry['index']} ({position}/{len(todo)}): {entry['title']}"

      try:
        audio = self._synthesize(engine, chapter, entry, label, done_chars, total_chars, session)
      except BaseException:
        entry["status"] = "pending"
        self.store.save(book)
        raise

      file = self.store.chapter_file(entry["index"])
      duration = write_mp3(audio, SAMPLE_RATE, file)
      entry.update(
        {"status": "ready", "file": f"chapters/{file.name}", "duration": round(duration, 2), "size": file.stat().st_size}
      )
      self.store.save(book)
      for leftover in self.store.work_dir.glob(f"{entry['index']:03d}-*.wav"):
        leftover.unlink(missing_ok=True)
      done_chars += entry["chars"]
      self.emitter.emit(
        "chapter",
        {"bookId": book["id"], "bookDir": str(self.store.dir), "index": entry["index"], "title": entry["title"]},
      )

    return self._finish()

  def _finish(self) -> dict:
    self._progress(1.0, "Conversione completata")
    result = {"bookId": self.book["id"], "bookDir": str(self.store.dir), "title": self.book["title"]}
    self.emitter.emit("result", result)
    return result

  def _synthesize(self, engine, chapter, entry, label, done_chars, total_chars, session) -> np.ndarray:
    import soundfile as sf

    parts = [chunk.text for chunk in chunk_chapters([chapter], CHUNK_CHARS)]
    announce = _should_announce(chapter.title)
    if announce:
      parts.insert(0, chapter.title.rstrip(".") + ".")

    self.store.work_dir.mkdir(parents=True, exist_ok=True)
    pieces: list[np.ndarray] = []
    chapter_done = 0
    for part_index, text in enumerate(parts):
      self._ensure_not_cancelled()
      cached = self.store.chunk_file(entry["index"], part_index)
      if cached.exists():
        audio, _ = sf.read(str(cached), dtype="float32")
      else:
        audio = engine.synthesize(text)
        sf.write(str(cached), audio, SAMPLE_RATE)
        session["chars"] += len(text)

      is_title = announce and part_index == 0
      pieces.append(audio)
      pieces.append(silence(PAUSE_AFTER_TITLE if is_title else PAUSE_BETWEEN_CHUNKS, SAMPLE_RATE))
      if not is_title:
        chapter_done = min(chapter_done + len(text), entry["chars"])

      self._progress(
        (done_chars + chapter_done) / total_chars,
        label,
        chapterIndex=entry["index"],
        chapterProgress=round(chapter_done / max(entry["chars"], 1), 4),
        etaSeconds=self._eta(session, total_chars - done_chars - chapter_done),
      )

    return np.concatenate(pieces) if pieces else np.zeros(1, dtype=np.float32)

  def _eta(self, session: dict, remaining_chars: int) -> int | None:
    elapsed = time.monotonic() - session["started"]
    if session["chars"] < 300 or elapsed < 20:
      return None
    return int(max(0, remaining_chars) / (session["chars"] / elapsed))

  def _progress(self, value: float, label: str, **extra) -> None:
    payload = {"bookId": self.book["id"], "progress": round(max(0.0, min(value, 1.0)), 4), "label": label}
    payload.update({key: val for key, val in extra.items() if val is not None})
    self.emitter.emit("progress", payload)

  def _ensure_not_cancelled(self) -> None:
    if self.is_cancelled():
      raise JobCancelled()


def _should_announce(title: str) -> bool:
  """Legge il titolo del capitolo solo se e un titolo vero, non 'Parte 3' generata da noi."""
  return bool(title.strip()) and not slugify(title).startswith("parte-") and len(title) <= 120
