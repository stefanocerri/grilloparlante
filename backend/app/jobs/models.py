from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ExtractedDocument:
  title: str
  file_type: str
  text: str
  toc: list[str] = field(default_factory=list)
  # Inizio esatto dei capitoli nel testo (offset, titolo), quando la sorgente lo sa
  toc_marks: list[tuple[int, str]] = field(default_factory=list)
  metadata: dict[str, str] = field(default_factory=dict)
  ocr_used: bool = False
  warnings: list[str] = field(default_factory=list)
  cover_bytes: bytes | None = None
  cover_extension: str | None = None
  # Capitoli gia separati dalla sorgente (es. segnalibri del PDF): (titolo, testo)
  sections: list[tuple[str, str]] = field(default_factory=list)
  author: str = ""
  # Tipo di contenuto: libro | documentazione | articolo | notiziario
  kind: str = "libro"
  # Metadati per capitolo, allineati a `sections` (fonte, link, date...)
  section_meta: list[dict[str, str]] = field(default_factory=list)
  # Leggere ad alta voce il titolo di ogni capitolo (no per articoli e notizie)
  read_titles: bool = True


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
