from __future__ import annotations

import re

_HYPHEN_BREAK = re.compile(r"(\w)[-­]\s*\n\s*(\w)")
_SINGLE_NEWLINE = re.compile(r"(?<!\n)\n(?!\n)")
_PAGE_NUMBER_LINE = re.compile(r"^\s*\d{1,4}\s*$", re.MULTILINE)
_SPACES = re.compile(r"[ \t]{2,}")


def clean_for_speech(text: str) -> str:
  """Ripulisce il testo estratto da PDF prima della lettura."""
  text = text.replace(" ", " ")
  text = _PAGE_NUMBER_LINE.sub("", text)
  text = _HYPHEN_BREAK.sub(r"\1\2", text)   # "pro-\nblema" -> "problema"
  text = _SINGLE_NEWLINE.sub(" ", text)     # a capo dentro il paragrafo -> spazio
  text = _SPACES.sub(" ", text)
  text = re.sub(r"\n{3,}", "\n\n", text)
  return text.strip()
