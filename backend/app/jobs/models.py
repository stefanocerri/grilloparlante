from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ExtractedDocument:
  title: str
  file_type: str
  text: str
  # Content type shown in the reader: libro | documentazione | articolo | notiziario
  kind: str = "libro"
  toc: list[str] = field(default_factory=list)
  # Exact chapter start offsets in `text` (offset, title), when the source provides them.
  toc_marks: list[tuple[int, str]] = field(default_factory=list)
  metadata: dict[str, str] = field(default_factory=dict)
  ocr_used: bool = False
  warnings: list[str] = field(default_factory=list)
  cover_bytes: bytes | None = None
  cover_extension: str | None = None
  # Chapters defined by the source itself (e.g. JSON input): skip detection.
  chapters: list["Chapter"] = field(default_factory=list)


@dataclass
class Chapter:
  id: str
  title: str
  text: str
  start_index: int = 0
  end_index: int = 0
  source: str = "fallback"
  output_path: str | None = None
  meta: dict[str, str] = field(default_factory=dict)


@dataclass
class Chunk:
  id: str
  chapter_id: str
  index: int
  text: str
  output_path: str | None = None
