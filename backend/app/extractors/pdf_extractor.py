from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.chaptering.toc_detector import sections_from_marks
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


PAGE_NUMBER_LINE = re.compile(r"^\s*(?:pag(?:ina|e)?\.?\s*)?[-\u2013\u2014]?\s*[0-9ivxlcdm]{1,6}\s*[-\u2013\u2014]?\s*(?:(?:/|di|of)\s*\d+)?\s*$", re.IGNORECASE)
EDGE_LINES = 2


def _edge_key(line: str) -> str:
  return re.sub(r"\d+", "#", re.sub(r"\s+", " ", line.strip().lower()))


def _strip_headers_footers(pages: list[list[str]]) -> list[list[str]]:
  """Drop running headers/footers and page numbers repeated across pages."""
  usable = [page for page in pages if page]
  repeated: set[str] = set()

  if len(usable) >= 4:
    counts: dict[str, int] = {}
    for page in usable:
      edges = {_edge_key(line) for line in page[:EDGE_LINES] + page[-EDGE_LINES:] if line.strip()}
      for key in edges:
        counts[key] = counts.get(key, 0) + 1
    threshold = max(3, int(len(usable) * 0.4))
    repeated = {key for key, count in counts.items() if count >= threshold and len(key) <= 120}

  cleaned_pages: list[list[str]] = []
  for page in pages:
    lines = list(page)
    for _ in range(EDGE_LINES + 1):
      if lines and (_edge_key(lines[0]) in repeated or PAGE_NUMBER_LINE.match(lines[0])):
        lines.pop(0)
      if lines and (_edge_key(lines[-1]) in repeated or PAGE_NUMBER_LINE.match(lines[-1])):
        lines.pop()
    cleaned_pages.append(lines)

  return cleaned_pages


def _page_text(lines: list[str]) -> str:
  text = "\n".join(line.rstrip() for line in lines)
  # Re-join words hyphenated across a line break ("raga-\nzzi" -> "ragazzi").
  text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
  return compact_whitespace(text)


def extract_pdf(file_path: str) -> ExtractedDocument:
  from pypdf import PdfReader

  reader = PdfReader(file_path)
  raw_pages: list[list[str]] = []
  for page in reader.pages:
    try:
      raw = page.extract_text() or ""
    except Exception:
      raw = ""
    raw_pages.append([line for line in raw.splitlines() if line.strip()])

  pages = [_page_text(lines) for lines in _strip_headers_footers(raw_pages)]

  # Testo completo, ricordando dove inizia ogni pagina.
  page_offsets: list[int] = []
  parts: list[str] = []
  length = 0
  for page_text in pages:
    if parts and page_text:
      parts.append("\n\n")
      length += 2
    page_offsets.append(length)
    if page_text:
      parts.append(page_text)
      length += len(page_text)
  text = "".join(parts)

  # Segnalibri -> inizio capitolo; dentro la pagina si aggancia al titolo se e visibile,
  # cosi un capitolo che inizia a meta pagina non si porta dietro la fine del precedente.
  toc_marks: list[tuple[int, str]] = []
  lowered = text.lower()
  for title, page_index in _outline_entries(reader):
    if page_index >= len(page_offsets):
      continue
    offset = page_offsets[page_index]
    page_end = page_offsets[page_index + 1] if page_index + 1 < len(page_offsets) else len(text)
    words = title.lower().split()
    if words:
      match = re.compile(r"\s+".join(re.escape(word) for word in words)).search(lowered, offset, page_end)
      if match:
        offset = match.start()
    toc_marks.append((offset, title))

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
    toc=[title for _, title in toc_marks],
    toc_marks=toc_marks,
    warnings=warnings,
    cover_bytes=cover_bytes,
    cover_extension=cover_extension,
    sections=sections_from_marks(text, toc_marks),
  )
