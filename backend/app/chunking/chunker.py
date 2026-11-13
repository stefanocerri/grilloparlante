"""Divide il testo di un capitolo nei pezzi che la voce legge uno alla volta.

Due modi:
- a misura di frase (`by_sentence=True`): pezzi corti, tagliati solo a fine frase, che non scavalcano un paragrafo;
  ogni pezzo sa se chiude un paragrafo o una scena, così chi monta l'audio mette la pausa giusta;
- classico: pezzi lunghi che uniscono più paragrafi (la divisione di prima, tenuta per le voci create dall'utente).
"""

from __future__ import annotations

import math
import re

from app.jobs.models import Chapter, Chunk

SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+")
MIN_TAIL_CHARS = 200

# Fine frase: punto, domanda, esclamazione o puntini, più le eventuali virgolette o parentesi chiuse.
_SENTENCE_END = re.compile(r"[.!?…]+[»”\"’')\]]*\s+")
# Dove dividere una frase troppo lunga, dal taglio migliore al peggiore.
_CLAUSE_BREAKS = (re.compile(r"(?<=[;:])\s+"), re.compile(r"(?<=,)\s+"), re.compile(r"\s+"))
# Una riga di soli simboli (***, * * *, —, ---, ⁂) è un cambio di scena, non testo da leggere.
_SCENE_MARK = re.compile(r"^[\s*⁂—–\-_·•~#=]+$")
# Quanto può sforare un pezzo per non lasciarne uno cortissimo da solo.
_OVERFLOW = 1.2


def is_scene_mark(paragraph: str) -> bool:
  return bool(_SCENE_MARK.match(paragraph)) and bool(paragraph.strip())


def split_sentences(paragraph: str) -> list[str]:
  """Frasi di un paragrafo. Non divide dopo un'iniziale («J. R. R. Tolkien») né prima di una minuscola
  («…prendermi?» pensò): lì la frase continua."""
  sentences: list[str] = []
  start = 0
  for match in _SENTENCE_END.finditer(paragraph):
    following = paragraph[match.end():match.end() + 1]
    if not following or following.islower() or following.isdigit():
      continue
    before = paragraph[start:match.start()]
    last_word = before.split()[-1] if before.split() else ""
    if match.group().rstrip() == "." and len(last_word.strip("«“\"'(")) == 1 and last_word[-1:].isupper():
      continue
    sentences.append(paragraph[start:match.end()].strip())
    start = match.end()
  rest = paragraph[start:].strip()
  if rest:
    sentences.append(rest)
  return sentences


def _pack(parts: list[str], limit: int) -> list[str]:
  """Raggruppa le parti in pezzi di lunghezza simile, ognuno entro `limit`."""
  total = sum(len(part) for part in parts) + max(len(parts) - 1, 0)
  if total <= limit:
    return [" ".join(parts)] if parts else []
  # Pezzi di lunghezza simile invece di tanti pieni e un avanzo: così nessuno resta cortissimo.
  goal = total / math.ceil(total / limit)
  pieces: list[str] = []
  current = ""
  for part in parts:
    candidate = f"{current} {part}" if current else part
    if current and (len(candidate) > limit or len(current) >= goal):
      pieces.append(current)
      current = part
    else:
      current = candidate
  if current:
    pieces.append(current)
  return pieces


def _split_long_sentence(sentence: str, limit: int) -> list[str]:
  """Una frase più lunga del limite si divide a punto e virgola o due punti, poi a virgola, in ultimo tra le parole."""
  if len(sentence) <= limit:
    return [sentence]
  for pattern in _CLAUSE_BREAKS:
    parts = [part for part in pattern.split(sentence) if part]
    if len(parts) > 1 and all(len(part) <= limit for part in parts):
      return _pack(parts, limit)
  # Nemmeno tra le parole si riesce (una «parola» lunghissima): si taglia dove capita.
  return [sentence[i:i + limit] for i in range(0, len(sentence), limit)]


def _split_paragraph_by_sentence(paragraph: str, limit: int, minimum: int) -> list[str]:
  if len(paragraph) <= limit * _OVERFLOW and len(split_sentences(paragraph)) == 1 or len(paragraph) <= limit:
    return [paragraph]
  parts: list[str] = []
  for sentence in split_sentences(paragraph):
    # Una frase poco più lunga del limite resta intera: divisa a metà, l'intonazione ripartirebbe dopo i due punti
    # o la virgola. Si divide solo quando è davvero troppo lunga.
    if len(sentence) <= limit * _OVERFLOW:
      parts.append(sentence)
    else:
      parts.extend(_split_long_sentence(sentence, limit))
  pieces = _pack(parts, limit)
  # Un avanzo cortissimo si unisce al pezzo prima: sui pezzi brevi la voce aggiunge suoni che non ci sono.
  if len(pieces) > 1 and len(pieces[-1]) < minimum and len(pieces[-2]) + 1 + len(pieces[-1]) <= limit * _OVERFLOW:
    tail = pieces.pop()
    pieces[-1] = f"{pieces[-1]} {tail}"
  return pieces


def _chunk_by_sentence(chapter: Chapter, limit: int, minimum: int) -> list[Chunk]:
  # 1. Paragrafi, con i cambi di scena segnati sul paragrafo che li precede.
  paragraphs: list[tuple[str, bool]] = []
  for block in chapter.text.split("\n\n"):
    block = block.strip()
    if not block:
      continue
    if is_scene_mark(block):
      if paragraphs:
        paragraphs[-1] = (paragraphs[-1][0], True)
      continue
    paragraphs.append((block, False))

  # 2. Ogni paragrafo in pezzi a fine frase.
  pieces: list[Chunk] = []
  for paragraph, scene_break in paragraphs:
    texts = _split_paragraph_by_sentence(paragraph, limit, minimum)
    for position, text in enumerate(texts):
      last = position == len(texts) - 1
      pieces.append(Chunk(id="", chapter_id=chapter.id, index=0, text=text, ends_paragraph=last, scene_break=last and scene_break))

  # 3. I paragrafi cortissimi (battute di dialogo, titoletti) si uniscono al vicino: prima a quello dopo, altrimenti
  #    a quello prima. Mai attraverso un cambio di scena. L'a capo resta nel testo: vale una pausa un po' più lunga.
  merged: list[Chunk] = []
  pending: Chunk | None = None

  def flush(chunk: Chunk) -> None:
    previous = merged[-1] if merged else None
    if (
      previous is not None
      and previous.ends_paragraph
      and not previous.scene_break
      and len(previous.text) + 1 + len(chunk.text) <= limit * _OVERFLOW
    ):
      previous.text = f"{previous.text}\n{chunk.text}"
      previous.scene_break = chunk.scene_break
    else:
      merged.append(chunk)

  for piece in pieces:
    if pending is not None:
      if not pending.scene_break and len(pending.text) + 1 + len(piece.text) <= limit:
        piece.text = f"{pending.text}\n{piece.text}"
      else:
        flush(pending)
      pending = None
    if len(piece.text) < minimum and piece.ends_paragraph:
      pending = piece
    else:
      merged.append(piece)
  if pending is not None:
    flush(pending)

  for index, chunk in enumerate(merged, start=1):
    chunk.index = index
    chunk.id = f"{chapter.id}-part-{index:03d}"
  return merged


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


def _chunk_classic(chapter: Chapter, target_chars: int) -> list[Chunk]:
  chunks: list[Chunk] = []
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
  if current.strip() and chunks and len(current) < MIN_TAIL_CHARS:
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


def chunk_chapters(
  chapters: list[Chapter],
  target_chars: int,
  min_chars: int = 0,
  by_sentence: bool = False,
) -> list[Chunk]:
  chunks: list[Chunk] = []
  for chapter in chapters:
    if by_sentence:
      chunks.extend(_chunk_by_sentence(chapter, target_chars, min_chars))
    else:
      chunks.extend(_chunk_classic(chapter, target_chars))
  return chunks
