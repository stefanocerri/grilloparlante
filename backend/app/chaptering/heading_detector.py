from __future__ import annotations

import re

from app.jobs.models import Chapter
from app.utils.files import slugify

HEADING_PATTERNS = [
  re.compile(
    r"^(?P<title>(?:capitolo|chapter|parte|sezione)\s+[0-9ivxlcdm]+[^\n]{0,80})$",
    re.IGNORECASE | re.MULTILINE
  ),
  re.compile(
    r"^(?P<title>[0-9ivxlcdm]+\.\s+[A-ZÀ-ÖØ-Ý][^\n]{2,80})$",
    re.MULTILINE
  )
]


def detect_from_headings(text: str) -> list[Chapter]:
  matches: list[tuple[int, str]] = []

  for pattern in HEADING_PATTERNS:
    for match in pattern.finditer(text):
      title = match.group("title").strip()
      matches.append((match.start(), re.sub(r"\s+", " ", title)))

  if len(matches) < 2:
    return []

  unique_matches = sorted(set(matches), key=lambda item: item[0])
  chapters: list[Chapter] = []

  for index, (start, title) in enumerate(unique_matches):
    end = unique_matches[index + 1][0] if index + 1 < len(unique_matches) else len(text)
    section = text[start:end].strip()

    if len(section) < 120:
      continue

    chapters.append(
      Chapter(
        id=f"chapter-{index + 1:02d}-{slugify(title)[:24]}",
        title=title,
        text=section,
        start_index=start,
        end_index=end,
        source="heading"
      )
    )

  return chapters


def fallback_sections(text: str, target_chars: int = 9000) -> list[Chapter]:
  if not text.strip():
    return []

  boundaries = [0]
  cursor = target_chars

  while cursor < len(text):
    split = max(
      text.rfind("\n\n", 0, cursor),
      text.rfind(". ", 0, cursor),
      text.rfind("? ", 0, cursor),
      text.rfind("! ", 0, cursor)
    )
    boundaries.append(split if split > boundaries[-1] else cursor)
    cursor += target_chars

  boundaries.append(len(text))

  chapters: list[Chapter] = []

  for index in range(len(boundaries) - 1):
    start, end = boundaries[index], boundaries[index + 1]
    section = text[start:end].strip()
    if not section:
      continue
    title = f"Section {index + 1:02d}"
    chapters.append(
      Chapter(
        id=f"chapter-{index + 1:02d}-{slugify(title)}",
        title=title,
        text=section,
        start_index=start,
        end_index=end,
        source="fallback"
      )
    )

  return chapters
