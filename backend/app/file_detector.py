from __future__ import annotations

from pathlib import Path


SUPPORTED_TYPES = {
  ".pdf": "pdf",
  ".epub": "epub",
  ".txt": "txt",
  ".md": "txt"
}


def detect_file_type(file_path: str) -> str:
  extension = Path(file_path).suffix.lower()
  return SUPPORTED_TYPES.get(extension, "unknown")
