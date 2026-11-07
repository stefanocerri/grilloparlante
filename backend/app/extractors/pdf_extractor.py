from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.jobs.models import ExtractedDocument
from app.utils.files import compact_whitespace


def _extract_cover_from_pdf(reader: Any) -> tuple[bytes | None, str | None]:
  if not reader.pages:
    return None, None

  first_page = reader.pages[0]

  try:
    images = list(first_page.images)
  except Exception:
    return None, None

  if not images:
    return None, None

  first_image = images[0]
  name = str(getattr(first_image, "name", "") or "").lower()

  if name.endswith(".png"):
    return first_image.data, "png"
  if name.endswith(".jpg") or name.endswith(".jpeg"):
    return first_image.data, "jpg"
  if name.endswith(".jp2"):
    return first_image.data, "jp2"

  return first_image.data, "jpg"


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


def _outline_entries(reader: Any) -> list[tuple[int, str, int]]:
  """Flatten PDF bookmarks into (page_index, title, depth)."""
  entries: list[tuple[int, str, int]] = []

  def walk(nodes: Any, depth: int) -> None:
    for node in nodes:
      if isinstance(node, list):
        walk(node, depth + 1)
        continue
      title = str(getattr(node, "title", "") or "").strip()
      if not title:
        continue
      try:
        page_index = reader.get_destination_page_number(node)
      except Exception:
        continue
      if page_index is None or page_index < 0:
        continue
      entries.append((page_index, title, depth))

  try:
    walk(reader.outline, 0)
  except Exception:
    return []

  if not entries:
    return []

  # Prefer the top level; if it is just a single wrapper (e.g. the book title), go one deeper.
  for depth in sorted({entry[2] for entry in entries}):
    level = [entry for entry in entries if entry[2] == depth]
    if len(level) >= 2:
      return sorted(level, key=lambda entry: entry[0])
  return []


def extract_pdf(file_path: str) -> ExtractedDocument:
  try:
    from pypdf import PdfReader
  except ImportError as error:  # pragma: no cover - dependency availability
    raise RuntimeError(
      "Missing Python dependency 'pypdf'. Install backend requirements first."
    ) from error

  reader = PdfReader(file_path)
  raw_pages: list[list[str]] = []
  for page in reader.pages:
    try:
      raw = page.extract_text() or ""
    except Exception:
      raw = ""
    raw_pages.append([line for line in raw.splitlines() if line.strip()])

  page_texts = [_page_text(lines) for lines in _strip_headers_footers(raw_pages)]

  # Build the full text while remembering where each page starts.
  page_offsets: list[int] = []
  parts: list[str] = []
  length = 0
  for page_text in page_texts:
    if parts and page_text:
      parts.append("\n\n")
      length += 2
    page_offsets.append(length)
    if page_text:
      parts.append(page_text)
      length += len(page_text)
  text = "".join(parts)

  toc: list[str] = []
  toc_marks: list[tuple[int, str]] = []
  lowered = text.lower()
  for page_index, title, _ in _outline_entries(reader):
    if page_index >= len(page_offsets):
      continue
    toc.append(title)
    offset = page_offsets[page_index]
    page_end = page_offsets[page_index + 1] if page_index + 1 < len(page_offsets) else len(text)
    # Snap to the heading inside the page when it is visible there.
    words = title.lower().split()
    if words:
      pattern = re.compile(r"\s+".join(re.escape(word) for word in words))
      match = pattern.search(lowered, offset, page_end)
      if match:
        offset = match.start()
    toc_marks.append((offset, title))

  metadata = {
    "author": getattr(reader.metadata, "author", "") or "",
    "title": getattr(reader.metadata, "title", "") or ""
  }
  warnings: list[str] = []
  cover_bytes, cover_extension = _extract_cover_from_pdf(reader)

  if len(text) < 120:
    warnings.append(
      "Very little selectable text was extracted from the PDF. OCR fallback is not implemented yet."
    )

  return ExtractedDocument(
    title=metadata["title"] or Path(file_path).stem,
    file_type="pdf",
    text=text,
    toc=toc,
    toc_marks=toc_marks,
    metadata=metadata,
    ocr_used=False,
    warnings=warnings,
    cover_bytes=cover_bytes,
    cover_extension=cover_extension
  )
