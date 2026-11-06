"""Passo 1: PDF/EPUB -> scheda del libro con i capitoli (nessun audio ancora).

Veloce: estrae il testo, trova i capitoli e salva in books/<id>/:
  book.json        capitoli con stato "pending" e durata stimata
  text/001.txt     testo pulito di ogni capitolo, pronto per la sintesi
"""

from __future__ import annotations

from pathlib import Path

from app.chaptering.heading_detector import detect_from_headings, fallback_sections
from app.chaptering.toc_detector import detect_from_toc
from app.extractors.epub_extractor import extract_epub
from app.extractors.pdf_extractor import extract_pdf
from app.extractors.text_extractor import extract_text_file
from app.file_detector import detect_file_type
from app.jobs.models import Chapter, ExtractedDocument
from app.library import BookStore, make_book_id, now_iso
from app.text_cleanup import clean_for_speech
from app.utils.events import EventEmitter
from app.voices import get_voice

FALLBACK_CHAPTER_CHARS = 15000  # libro senza capitoli: parti da ~15-20 minuti
CHARS_PER_MINUTE = 850          # lettura italiana a velocita normale, per la stima


def estimate_minutes(chars: int, speed: float) -> float:
  return round(chars / (CHARS_PER_MINUTE * max(speed, 0.5)), 1)


class ImportJob:
  def __init__(self, input_path: str, voice_id: str, speed: float, library_dir: str, emitter: EventEmitter) -> None:
    self.input_path = Path(input_path).expanduser().resolve()
    self.voice = get_voice(voice_id)
    self.speed = round(float(speed), 2)
    self.library_dir = Path(library_dir).expanduser().resolve()
    self.emitter = emitter

  def run(self) -> dict:
    document = self._extract()
    chapters = self._split_chapters(document)
    book_id = make_book_id(document.title, self.input_path, self.voice.id, self.speed)
    store = BookStore(self.library_dir, book_id)

    if store.exists():
      book = store.load()
      self.emitter.log("info", "Libro gia importato: riapro la sua scheda")
    else:
      book = self._create_book(store, book_id, document, chapters)

    result = {"bookId": book_id, "bookDir": str(store.dir), "title": book["title"]}
    self.emitter.emit("result", result)
    return result

  def _extract(self) -> ExtractedDocument:
    file_type = detect_file_type(str(self.input_path))
    if file_type == "pdf":
      document = extract_pdf(str(self.input_path))
    elif file_type == "epub":
      document = extract_epub(str(self.input_path))
    elif file_type == "txt":
      document = extract_text_file(str(self.input_path))
    else:
      raise RuntimeError(f"Formato non supportato: {self.input_path.suffix}")

    for warning in document.warnings:
      self.emitter.warning(warning)
    if not document.text.strip():
      raise RuntimeError("Non riesco a estrarre testo: il PDF sembra una scansione.")
    return document

  def _split_chapters(self, document: ExtractedDocument) -> list[Chapter]:
    if document.sections:
      chapters = [
        Chapter(id=f"chapter-{i:03d}", title=title, text=text, source="outline")
        for i, (title, text) in enumerate(document.sections, start=1)
      ]
      mode = "segnalibri del PDF"
    else:
      chapters = detect_from_toc(document.text, document.toc)
      mode = "indice"
      if not chapters:
        chapters = detect_from_headings(document.text)
        mode = "titoli dei capitoli"
      if not chapters:
        chapters = fallback_sections(document.text, target_chars=FALLBACK_CHAPTER_CHARS)
        mode = "parti di lunghezza simile (nessun capitolo trovato)"

    for chapter in chapters:
      chapter.text = clean_for_speech(chapter.text)
    chapters = [chapter for chapter in chapters if chapter.text]
    self.emitter.log("info", f"{len(chapters)} capitoli trovati usando {mode}")
    return chapters

  def _create_book(self, store: BookStore, book_id: str, document: ExtractedDocument, chapters: list[Chapter]) -> dict:
    store.dir.mkdir(parents=True, exist_ok=True)
    cover = None
    if document.cover_bytes and document.cover_extension:
      cover = f"cover.{document.cover_extension}"
      (store.dir / cover).write_bytes(document.cover_bytes)

    for index, chapter in enumerate(chapters, start=1):
      store.text_file(index).parent.mkdir(parents=True, exist_ok=True)
      store.text_file(index).write_text(chapter.text, encoding="utf-8")

    book = {
      "id": book_id,
      "title": document.title,
      "author": document.author,
      "voice": {"id": self.voice.id, "name": self.voice.name},
      "speed": self.speed,
      "sourceFile": self.input_path.name,
      "cover": cover,
      "createdAt": now_iso(),
      "chapters": [
        {
          "index": index,
          "title": chapter.title,
          "status": "pending",
          "file": None,
          "duration": None,
          "chars": len(chapter.text),
          "estimatedMinutes": estimate_minutes(len(chapter.text), self.speed),
        }
        for index, chapter in enumerate(chapters, start=1)
      ],
    }
    store.save(book)
    return book
