from __future__ import annotations

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


def extract_pdf(file_path: str) -> ExtractedDocument:
  try:
    from pypdf import PdfReader
  except ImportError as error:  # pragma: no cover - dependency availability
    raise RuntimeError(
      "Missing Python dependency 'pypdf'. Install backend requirements first."
    ) from error

  reader = PdfReader(file_path)
  pages = [compact_whitespace(page.extract_text() or "") for page in reader.pages]
  text = "\n\n".join(page for page in pages if page).strip()
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
    metadata=metadata,
    ocr_used=False,
    warnings=warnings,
    cover_bytes=cover_bytes,
    cover_extension=cover_extension
  )
