from __future__ import annotations

from pathlib import Path
from typing import Any

from app.jobs.models import ExtractedDocument
from app.utils.files import compact_whitespace


def _flatten_toc(items: list, sink: list[str]) -> None:
  for item in items:
    if isinstance(item, tuple) and item:
      label = getattr(item[0], "title", None)
      if label:
        sink.append(str(label))
      if len(item) > 1 and isinstance(item[1], list):
        _flatten_toc(item[1], sink)
      continue

    label = getattr(item, "title", None)
    if label:
      sink.append(str(label))


def _guess_extension(item: Any) -> str | None:
  file_name = getattr(item, "file_name", "") or getattr(item, "get_name", lambda: "")()
  suffix = Path(str(file_name)).suffix.lower().lstrip(".")
  if suffix:
    return suffix

  media_type = getattr(item, "media_type", "") or ""
  if "jpeg" in media_type or "jpg" in media_type:
    return "jpg"
  if "png" in media_type:
    return "png"
  if "webp" in media_type:
    return "webp"

  return None


def _extract_cover(book: Any) -> tuple[bytes | None, str | None]:
  cover_metadata = book.get_metadata("OPF", "cover")
  if cover_metadata:
    _, attributes = cover_metadata[0]
    cover_id = attributes.get("content")
    if cover_id:
      item = book.get_item_with_id(cover_id)
      if item:
        return item.get_content(), _guess_extension(item)

  for item in book.get_items():
    file_name = str(getattr(item, "file_name", "") or "").lower()
    item_id = str(getattr(item, "id", "") or getattr(item, "get_id", lambda: "")()).lower()
    media_type = str(getattr(item, "media_type", "") or "").lower()

    if "image" not in media_type:
      continue

    if "cover" in file_name or "cover" in item_id:
      return item.get_content(), _guess_extension(item)

  return None, None


def extract_epub(file_path: str) -> ExtractedDocument:
  try:
    from bs4 import BeautifulSoup
    from ebooklib import ITEM_DOCUMENT, epub
  except ImportError as error:  # pragma: no cover - dependency availability
    raise RuntimeError(
      "Missing Python dependencies 'ebooklib' and/or 'beautifulsoup4'."
    ) from error

  book = epub.read_epub(file_path)
  text_blocks: list[str] = []

  for item in book.get_items():
    if item.get_type() != ITEM_DOCUMENT:
      continue
    soup = BeautifulSoup(item.get_content(), "html.parser")
    content = compact_whitespace(soup.get_text(separator="\n"))
    if content:
      text_blocks.append(content)

  toc: list[str] = []
  _flatten_toc(list(book.toc), toc)
  cover_bytes, cover_extension = _extract_cover(book)

  title = "Untitled EPUB"
  if book.get_metadata("DC", "title"):
    title = str(book.get_metadata("DC", "title")[0][0])

  return ExtractedDocument(
    title=title or Path(file_path).stem,
    file_type="epub",
    text="\n\n".join(text_blocks).strip(),
    toc=toc,
    metadata={"toc_entries": str(len(toc))},
    cover_bytes=cover_bytes,
    cover_extension=cover_extension
  )
