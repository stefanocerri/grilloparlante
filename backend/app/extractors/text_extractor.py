from __future__ import annotations

from pathlib import Path

from app.jobs.models import ExtractedDocument
from app.utils.files import compact_whitespace


def extract_text_file(file_path: str) -> ExtractedDocument:
  source = Path(file_path)
  text = compact_whitespace(source.read_text(encoding="utf-8", errors="ignore"))
  return ExtractedDocument(
    title=source.stem.replace("_", " ").replace("-", " ").strip() or "Untitled text",
    file_type="txt",
    text=text
  )
