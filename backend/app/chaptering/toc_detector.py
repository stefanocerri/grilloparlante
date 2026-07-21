from __future__ import annotations

import re

from app.jobs.models import Chapter
from app.utils.files import slugify


def detect_from_toc(text: str, toc_entries: list[str]) -> list[Chapter]:
  if len(toc_entries) < 2:
    return []

  boundaries: list[tuple[int, str]] = []
  lowered = text.lower()

  for title in toc_entries:
    needle = title.strip()
    if len(needle) < 3:
      continue

    position = lowered.find(needle.lower())
    if position == -1:
      continue

    boundaries.append((position, needle))

  boundaries.sort(key=lambda item: item[0])

  if len(boundaries) < 2:
    return []

  chapters: list[Chapter] = []

  for index, (start, title) in enumerate(boundaries):
    end = boundaries[index + 1][0] if index + 1 < len(boundaries) else len(text)
    section = text[start:end].strip()

    if not section:
      continue

    chapters.append(
      Chapter(
        id=f"chapter-{index + 1:02d}-{slugify(title)[:24]}",
        title=re.sub(r"\s+", " ", title),
        text=section,
        start_index=start,
        end_index=end,
        source="toc"
      )
    )

  return chapters
