"""Passo 1: PDF/EPUB/TXT/JSON -> scheda del libro con i capitoli (nessun audio ancora).

Veloce: estrae il testo, trova i capitoli e salva in books/<id>/:
  book.json        capitoli con stato "pending" e durata stimata
  text/001.txt     testo pulito di ogni capitolo, pronto per la sintesi
"""

from __future__ import annotations

from pathlib import Path

from app.book_info import clean_info, find_isbn
from app.chaptering.heading_detector import detect_from_headings, fallback_sections
from app.chaptering.toc_detector import detect_from_toc
from app.extractors.epub_extractor import extract_epub
from app.extractors.json_extractor import JsonInputError, extract_json
from app.extractors.pdf_extractor import extract_pdf
from app.extractors.text_extractor import extract_text_file
from app.file_detector import detect_file_type
from app.jobs.models import Chapter, ExtractedDocument
from app.language import detect_language, language_name
from app.library import BookStore, make_book_id, now_iso
from app.text_cleanup import clean_for_speech, separate_title
from app.utils.events import EventEmitter
from app.voices import get_voice

FALLBACK_CHAPTER_CHARS = 15000  # libro senza capitoli: parti da ~15-20 minuti
CHARS_PER_MINUTE = 850          # lettura italiana a velocita normale, per la stima


def extract_document(input_path: Path, emitter: EventEmitter | None = None) -> ExtractedDocument:
  """Testo, capitoli della sorgente e metadati del file (PDF, EPUB, TXT/MD o JSON)."""
  file_type = detect_file_type(str(input_path))
  if file_type == "pdf":
    document = extract_pdf(str(input_path))
  elif file_type == "epub":
    document = extract_epub(str(input_path))
  elif file_type == "txt":
    document = extract_text_file(str(input_path))
  elif file_type == "json":
    try:
      document = extract_json(str(input_path))
    except JsonInputError as error:
      raise RuntimeError(f"File JSON non valido: {error}") from error
  else:
    raise RuntimeError(f"Formato non supportato: {input_path.suffix}")

  if emitter:
    for warning in document.warnings:
      emitter.warning(warning)
  if not document.text.strip():
    raise RuntimeError("Non riesco a estrarre testo: il PDF sembra una scansione.")
  return document


def file_language(input_path: str) -> str:
  """Lingua di un file prima di importarlo: serve a chiedere se tradurlo solo quando non è in italiano."""
  document = extract_document(Path(input_path).expanduser().resolve())
  return detect_language(document.text, document.info.get("language"))


def estimate_minutes(chars: int, speed: float) -> float:
  return round(chars / (CHARS_PER_MINUTE * max(speed, 0.5)), 1)


class ImportJob:
  def __init__(
    self, input_path: str, voice_id: str, speed: float, library_dir: str, emitter: EventEmitter, translate: bool = False
  ) -> None:
    self.input_path = Path(input_path).expanduser().resolve()
    # Se il libro non è in italiano: tradurlo (True) o farlo leggere nella sua lingua (False).
    self.translate = translate
    self.language = "it"
    self.voice = get_voice(voice_id)
    self.speed = round(float(speed), 2)
    self.library_dir = Path(library_dir).expanduser().resolve()
    self.emitter = emitter

  def run(self) -> dict:
    document = self._extract()
    self.language = detect_language(document.text, document.info.get("language"))
    if self.language != "it":
      self.emitter.log(
        "info", f"Libro in {language_name(self.language)}: " + ("lo traduco in italiano" if self.translate else "la voce lo legge in originale")
      )
    chapters = self._split_chapters(document)
    book_id = make_book_id(document.title, self.input_path, self.voice.id, self.speed)
    store = BookStore(self.library_dir, book_id)

    if store.exists():
      book = store.load()
      self.emitter.log("info", "Libro gia importato: riapro la sua scheda")
      wanted = self.translate and book.get("language", "it") != "it"
      if wanted != bool(book.get("translate")) and book.get("language", "it") != "it":
        # Reimportato con l'altra scelta sulla lingua: vale l'ultima, se nessun capitolo è ancora convertito.
        from app.translation.job import set_translation

        try:
          book = set_translation(store, wanted)
        except RuntimeError as error:
          self.emitter.warning(str(error))
    else:
      book = self._create_book(store, book_id, document, chapters)

    result = {"bookId": book_id, "bookDir": str(store.dir), "title": book["title"]}
    self.emitter.emit("result", result)
    return result

  def _extract(self) -> ExtractedDocument:
    return extract_document(self.input_path, self.emitter)

  def _split_chapters(self, document: ExtractedDocument) -> list[Chapter]:
    if document.sections:
      chapters = [
        Chapter(id=f"chapter-{i:03d}", title=title, text=text, source="outline")
        for i, (title, text) in enumerate(document.sections, start=1)
      ]
      mode = {
        "pdf": "segnalibri del PDF",
        "epub": "indice dell'EPUB",
        "json": "articoli del file JSON",
      }.get(document.file_type, "capitoli della sorgente")
    else:
      chapters = detect_from_toc(document.text, document.toc)
      mode = "indice"
      if not chapters:
        chapters = detect_from_headings(document.text)
        mode = "titoli dei capitoli"
      if not chapters:
        chapters = fallback_sections(document.text, target_chars=FALLBACK_CHAPTER_CHARS)
        mode = "parti di lunghezza simile (nessun capitolo trovato)"

    for position, chapter in enumerate(chapters):
      chapter.text = separate_title(clean_for_speech(chapter.text, language=self.language), chapter.title, self.language)
      if position < len(document.section_meta):
        chapter.meta = document.section_meta[position]
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

    info = dict(document.info)
    if document.kind in ("libro", "documentazione") and not info.get("isbn"):
      info["isbn"] = find_isbn(document.text)
    info = clean_info(info)

    book = {
      "id": book_id,
      "title": document.title,
      "author": document.author,
      "kind": document.kind,
      "readTitles": document.read_titles,
      # Lingua del testo importato; con `translate` i capitoli vengono tradotti in italiano prima della lettura.
      "language": self.language,
      **({"translate": True} if self.translate and self.language != "it" else {}),
      **({"info": info} if info else {}),
      **{key: document.metadata[key] for key in ("publishedAt", "expiresAt", "source", "url") if document.metadata.get(key)},
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
          **({"meta": chapter.meta} if chapter.meta else {}),
        }
        for index, chapter in enumerate(chapters, start=1)
      ],
    }
    store.save(book)
    return book
