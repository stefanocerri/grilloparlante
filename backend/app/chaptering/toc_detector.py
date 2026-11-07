from __future__ import annotations

import re

from app.jobs.models import Chapter
from app.utils.files import slugify

# Text before the first chapter shorter than this is treated as front matter noise.
MIN_LEADING_CHARS = 500


def _build_chapters(text: str, boundaries: list[tuple[int, str]]) -> list[Chapter]:
  boundaries = sorted(boundaries, key=lambda item: item[0])

  # Several TOC entries pointing at the same spot (e.g. "Part I" + "Chapter 1"):
  # keep a single boundary and merge the labels.
  merged: list[tuple[int, str]] = []
  for position, title in boundaries:
    if merged and position - merged[-1][0] < 40:
      merged[-1] = (merged[-1][0], f"{merged[-1][1]} - {title}")
      continue
    merged.append((position, title))

  if merged and merged[0][0] > 0:
    leading = text[:merged[0][0]].strip()
    if len(leading) >= MIN_LEADING_CHARS:
      merged.insert(0, (0, "Introduzione"))

  chapters: list[Chapter] = []

  for index, (start, title) in enumerate(merged):
    end = merged[index + 1][0] if index + 1 < len(merged) else len(text)
    section = text[start:end].strip()

    if not section:
      continue

    clean_title = re.sub(r"\s+", " ", title).strip()
    chapters.append(
      Chapter(
        id=f"chapter-{len(chapters) + 1:02d}-{slugify(clean_title)[:24]}",
        title=clean_title,
        text=section,
        start_index=start,
        end_index=end,
        source="toc"
      )
    )

  return chapters


def _find_sequential(text: str, toc_entries: list[str]) -> list[tuple[int, str]]:
  """Locate TOC titles in reading order, skipping a printed table of contents.

  Every title is searched after the previous match so that chapter order is kept.
  If the titles are found clustered together (a printed "Contents" page), the
  search is restarted after that cluster.
  """
  lowered = text.lower()
  entries = [entry.strip() for entry in toc_entries if len(entry.strip()) >= 3]

  def locate(start_at: int) -> list[tuple[int, str]]:
    found: list[tuple[int, str]] = []
    cursor = start_at
    for title in entries:
      pattern = re.compile(r"\s+".join(re.escape(word) for word in title.lower().split()))
      match = pattern.search(lowered, cursor)
      if not match:
        continue
      found.append((match.start(), title))
      cursor = match.end()
    return found

  found = locate(0)
  if len(found) >= 3:
    span = found[-1][0] - found[0][0]
    average_gap = span / (len(found) - 1)
    if average_gap < 200 and len(text) > 5000:
      # Looks like a printed TOC: search again after it.
      retry = locate(found[-1][0] + len(found[-1][1]))
      if len(retry) >= 2:
        return retry
  return found


def detect_from_toc(
  text: str,
  toc_entries: list[str],
  toc_marks: list[tuple[int, str]] | None = None
) -> list[Chapter]:
  if toc_marks and len(toc_marks) >= 2:
    chapters = _build_chapters(text, list(toc_marks))
    if len(chapters) >= 2:
      return chapters

  if len(toc_entries) < 2:
    return []

  boundaries = _find_sequential(text, toc_entries)
  if len(boundaries) < 2:
    return []

  return _build_chapters(text, boundaries)
