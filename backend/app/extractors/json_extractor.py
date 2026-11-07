"""JSON input for ready-made texts (articles, news digests).

The producer (e.g. a news app) sends clean, listen-ready text; the converter
only turns it into audio. Every article becomes its own chapter/track.
See docs/json-input.md for the full format.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from app.jobs.models import Chapter, ExtractedDocument
from app.utils.files import compact_whitespace, slugify

SUPPORTED_SCHEMA_VERSIONS = {1}
KINDS = {"articolo", "notiziario", "libro", "documentazione"}


class JsonInputError(ValueError):
  pass


def _text_of(node: dict, where: str) -> str:
  text = node.get("text")
  paragraphs = node.get("paragraphs")

  if isinstance(paragraphs, list) and paragraphs:
    if not all(isinstance(item, str) for item in paragraphs):
      raise JsonInputError(f"{where}: 'paragraphs' deve essere una lista di stringhe.")
    text = "\n\n".join(paragraphs)

  if not isinstance(text, str) or not text.strip():
    raise JsonInputError(f"{where}: manca il testo ('text' oppure 'paragraphs').")

  # Paragraphs are separated by blank lines; single newlines are just wrapping.
  blocks = [re.sub(r"\s+", " ", block).strip() for block in re.split(r"\n\s*\n", text)]
  return compact_whitespace("\n\n".join(block for block in blocks if block))


def _optional_str(node: dict, key: str) -> str:
  value = node.get(key)
  return value.strip() if isinstance(value, str) else ""


def _collect_items(data: dict) -> list[tuple[str, dict]]:
  """Return (section_title, item) pairs in reading order."""
  if "sections" in data:
    sections = data["sections"]
    if not isinstance(sections, list) or not sections:
      raise JsonInputError("'sections' deve essere una lista non vuota.")
    pairs: list[tuple[str, dict]] = []
    for s_index, section in enumerate(sections, start=1):
      if not isinstance(section, dict):
        raise JsonInputError(f"sections[{s_index}] deve essere un oggetto.")
      items = section.get("items")
      if not isinstance(items, list) or not items:
        raise JsonInputError(f"sections[{s_index}]: 'items' deve essere una lista non vuota.")
      for item in items:
        pairs.append((_optional_str(section, "title"), item))
    return pairs

  if "items" in data:
    items = data["items"]
    if not isinstance(items, list) or not items:
      raise JsonInputError("'items' deve essere una lista non vuota.")
    return [("", item) for item in items]

  # Single article: the root object itself is the item.
  return [("", data)]


def extract_json(file_path: str) -> ExtractedDocument:
  source = Path(file_path)

  try:
    data = json.loads(source.read_text(encoding="utf-8-sig"))
  except json.JSONDecodeError as error:
    raise JsonInputError(
      f"JSON non valido (riga {error.lineno}, colonna {error.colno}): {error.msg}"
    ) from error

  if not isinstance(data, dict):
    raise JsonInputError("Il JSON deve essere un oggetto, non una lista o un valore.")

  version = data.get("schemaVersion", 1)
  if version not in SUPPORTED_SCHEMA_VERSIONS:
    raise JsonInputError(
      f"schemaVersion {version!r} non supportata (supportate: {sorted(SUPPORTED_SCHEMA_VERSIONS)})."
    )

  kind = _optional_str(data, "kind").lower() or "articolo"
  if kind not in KINDS:
    raise JsonInputError(f"kind '{kind}' non valido. Valori ammessi: {', '.join(sorted(KINDS))}.")

  title = _optional_str(data, "title")
  if not title:
    raise JsonInputError("Manca 'title'.")

  warnings: list[str] = []
  chapters: list[Chapter] = []
  parts: list[str] = []
  offset = 0
  previous_section = None

  for index, (section_title, item) in enumerate(_collect_items(data), start=1):
    where = f"articolo {index}"
    if not isinstance(item, dict):
      raise JsonInputError(f"{where}: deve essere un oggetto.")

    item_title = _optional_str(item, "title") or (title if item is data else "")
    if not item_title:
      raise JsonInputError(f"{where}: manca 'title'.")

    body = _text_of(item, where)
    item_source = _optional_str(item, "source")

    spoken: list[str] = []
    if section_title and section_title != previous_section:
      spoken.append(f"{section_title}.")
    previous_section = section_title or previous_section
    spoken.append(item_title if item_title.endswith((".", "!", "?")) else f"{item_title}.")
    if item_source and data.get("announceSource", True):
      spoken.append(f"Fonte: {item_source}.")
    spoken.append(body)
    chapter_text = "\n\n".join(spoken)

    if len(body) < 80:
      warnings.append(f"L'{where} ('{item_title}') ha un testo molto corto.")

    chapter_title = f"{section_title} · {item_title}" if section_title else item_title
    meta = {
      key: value
      for key, value in {
        "section": section_title,
        "source": item_source,
        "url": _optional_str(item, "url"),
        "author": _optional_str(item, "author"),
        "publishedAt": _optional_str(item, "publishedAt")
      }.items()
      if value
    }

    if parts:
      parts.append("\n\n")
      offset += 2
    chapters.append(
      Chapter(
        id=f"chapter-{index:02d}-{slugify(item_title)[:24]}",
        title=chapter_title,
        text=chapter_text,
        start_index=offset,
        end_index=offset + len(chapter_text),
        source="source",
        meta=meta
      )
    )
    parts.append(chapter_text)
    offset += len(chapter_text)

  metadata = {
    key: value
    for key, value in {
      "author": _optional_str(data, "author"),
      "language": _optional_str(data, "language").lower(),
      "publishedAt": _optional_str(data, "publishedAt"),
      "expiresAt": _optional_str(data, "expiresAt"),
      "source": _optional_str(data, "source"),
      "url": _optional_str(data, "url")
    }.items()
    if value
  }

  return ExtractedDocument(
    title=title,
    file_type="json",
    kind=kind,
    text="".join(parts),
    toc=[chapter.title for chapter in chapters],
    metadata=metadata,
    warnings=warnings,
    chapters=chapters
  )

