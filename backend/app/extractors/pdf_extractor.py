from __future__ import annotations

from pathlib import Path
from typing import Any

from app.jobs.models import ExtractedDocument
from app.utils.files import compact_whitespace


def _extract_cover_from_pdf(reader: Any) -> tuple[bytes | None, str | None]:
  if not reader.pages:
    return None, None

  try:
    images = list(reader.pages[0].images)
  except Exception:
    return None, None

  if not images:
    return None, None

  first_image = images[0]
  name = str(getattr(first_image, "name", "") or "").lower()
  if name.endswith(".png"):
    return first_image.data, "png"
  return first_image.data, "jpg"


def _outline_entries(reader: Any) -> list[tuple[str, int]]:
  """Segnalibri di primo livello come (titolo, pagina). Se c'e un solo segnalibro
  radice con figli (es. il titolo del libro), usa i figli."""
  try:
    outline = reader.outline
  except Exception:
    return []

  def top_level(items: list) -> list[Any]:
    return [item for item in items if not isinstance(item, list)]

  def children_after(items: list, index: int) -> list:
    if index + 1 < len(items) and isinstance(items[index + 1], list):
      return items[index + 1]
    return []

  level = outline
  roots = top_level(level)
  if len(roots) == 1:
    nested = children_after(level, level.index(roots[0]))
    if len(top_level(nested)) >= 2:
      level = nested

  entries: list[tuple[str, int]] = []
  for item in top_level(level):
    try:
      page = reader.get_destination_page_number(item)
    except Exception:
      continue
    title = " ".join(str(getattr(item, "title", "") or "").split())
    if title and page is not None:
      entries.append((title, page))

  entries.sort(key=lambda entry: entry[1])
  return entries


def _sections_from_outline(pages: list[str], entries: list[tuple[str, int]]) -> list[tuple[str, str]]:
  sections: list[tuple[str, str]] = []
  for index, (title, start) in enumerate(entries):
    end = entries[index + 1][1] if index + 1 < len(entries) else len(pages)
    text = "\n\n".join(page for page in pages[start:max(end, start + 1)] if page).strip()
    if len(text) >= 200:
      sections.append((title, text))
  return sections if len(sections) >= 2 else []


def extract_pdf(file_path: str) -> ExtractedDocument:
  from pypdf import PdfReader

  reader = PdfReader(file_path)
  pages = [compact_whitespace(page.extract_text() or "") for page in reader.pages]
  text = "\n\n".join(page for page in pages if page).strip()
  meta = reader.metadata
  title = (getattr(meta, "title", "") or "").strip() if meta else ""
  author = (getattr(meta, "author", "") or "").strip() if meta else ""
  warnings: list[str] = []
  cover_bytes, cover_extension = _extract_cover_from_pdf(reader)

  if len(text) < 120:
    warnings.append(
      "Dal PDF esce pochissimo testo: probabilmente e una scansione (immagini). "
      "Serve un PDF con testo selezionabile."
    )

  return ExtractedDocument(
    title=title or Path(file_path).stem.replace("_", " "),
    author=author,
    file_type="pdf",
    text=text,
    warnings=warnings,
    cover_bytes=cover_bytes,
    cover_extension=cover_extension,
    sections=_sections_from_outline(pages, _outline_entries(reader)),
  )
