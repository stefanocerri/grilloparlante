from __future__ import annotations

import re

from app.jobs.models import Chapter, Chunk

SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+")
MIN_TAIL_CHARS = 200


def _split_paragraph(paragraph: str, target_chars: int) -> list[str]:
  if len(paragraph) <= target_chars:
    return [paragraph]

  sentences = SENTENCE_BREAK.split(paragraph)
  chunks: list[str] = []
  current = ""

  for sentence in sentences:
    sentence = sentence.strip()
    if not sentence:
      continue

    candidate = f"{current} {sentence}".strip()
    if current and len(candidate) > target_chars:
      chunks.append(current.strip())
      current = sentence
      continue
    current = candidate

  if current.strip():
    chunks.append(current.strip())

  return chunks or [paragraph]


def chunk_chapters(chapters: list[Chapter], target_chars: int) -> list[Chunk]:
  chunks: list[Chunk] = []

  for chapter in chapters:
    paragraphs = [block.strip() for block in chapter.text.split("\n\n") if block.strip()]
    chunk_index = 1
    current = ""

    for paragraph in paragraphs:
      for fragment in _split_paragraph(paragraph, target_chars):
        candidate = f"{current}\n\n{fragment}".strip() if current else fragment
        if current and len(candidate) > target_chars:
          chunks.append(
            Chunk(
              id=f"{chapter.id}-part-{chunk_index:03d}",
              chapter_id=chapter.id,
              index=chunk_index,
              text=current.strip()
            )
          )
          chunk_index += 1
          current = fragment
          continue
        current = candidate

    # Un ultimo pezzo cortissimo lo uniamo al precedente: sui pezzi brevi la voce aggiunge suoni che non ci sono.
    if current.strip() and chunks and chunks[-1].chapter_id == chapter.id and len(current) < MIN_TAIL_CHARS:
      chunks[-1].text = f"{chunks[-1].text}\n\n{current.strip()}"
      current = ""

    if current.strip():
      chunks.append(
        Chunk(
          id=f"{chapter.id}-part-{chunk_index:03d}",
          chapter_id=chapter.id,
          index=chunk_index,
          text=current.strip()
        )
      )

  return chunks
