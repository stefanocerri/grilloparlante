from __future__ import annotations

import hashlib
import re
from pathlib import Path


def ensure_directory(target: Path) -> Path:
  target.mkdir(parents=True, exist_ok=True)
  return target


def slugify(value: str, max_length: int | None = None) -> str:
  cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
  cleaned = cleaned.strip("-") or "book"

  if max_length is not None and max_length > 0 and len(cleaned) > max_length:
    cleaned = cleaned[:max_length].strip("-") or "book"

  return cleaned


def stable_slug(value: str, max_length: int = 48) -> str:
  base = slugify(value, max_length=max_length)
  digest = hashlib.sha1(value.encode("utf-8")).hexdigest()[:8]
  return f"{base}-{digest}"


def compact_whitespace(text: str) -> str:
  return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", text)).strip()
