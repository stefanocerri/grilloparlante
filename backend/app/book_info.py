"""Informazioni sul libro ricavate dal file stesso: editore, data, lingua, ISBN, descrizione, argomenti.

Il resto (titolo corretto, copertina, descrizione quando manca) lo cerca l'app online partendo da qui:
soprattutto dall'ISBN, che spesso sta nella pagina del copyright anche quando i metadati del file sono vuoti.
"""

from __future__ import annotations

import html
import re
from pathlib import Path

ISBN_CANDIDATE = re.compile(r"(?<![\dX])(?:97[89][\s\-‐-–]?)?(?:\d[\s\-‐-–]?){9}[\dXx](?![\dX])")
ISBN_LABEL = re.compile(r"ISBN(?:[\s\-]*1[03])?", re.IGNORECASE)

# Titoli che i programmi scrivono da soli nei metadati del PDF: meglio il nome del file.
JUNK_TITLE = re.compile(
  r"^(?:untitled|senza titolo|document\d*|documento\d*|microsoft (?:word|powerpoint)\b.*|.*\.(?:docx?|pdf|indd|odt|rtf|pages|tex|qxp)"
  r"|title|titolo|unknown|anonymous|\d+|[a-f0-9\-]{16,})$",
  re.IGNORECASE,
)


def is_valid_isbn(value: str) -> bool:
  digits = re.sub(r"[^0-9Xx]", "", value).upper()
  if len(digits) == 13 and digits.isdigit():
    total = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(digits[:12]))
    return (10 - total % 10) % 10 == int(digits[12])
  if len(digits) == 10 and digits[:9].isdigit():
    total = sum(int(d) * (10 - i) for i, d in enumerate(digits[:9]))
    check = 10 if digits[9] == "X" else int(digits[9]) if digits[9].isdigit() else -1
    return (total + check) % 11 == 0
  return False


def normalize_isbn(value: str) -> str:
  return re.sub(r"[^0-9Xx]", "", value).upper()


def find_isbn(text: str) -> str:
  """ISBN valido nelle prime e ultime pagine (copyright, colophon). Preferisce quelli preceduti da "ISBN"."""
  window = text[:20000] + "\n" + text[-6000:]
  best = ""
  for match in ISBN_CANDIDATE.finditer(window):
    candidate = normalize_isbn(match.group(0))
    if not is_valid_isbn(candidate):
      continue
    labelled = bool(ISBN_LABEL.search(window[max(0, match.start() - 16):match.start()]))
    if labelled:
      return candidate
    # Senza la scritta ISBN accetto solo i 13 cifre che iniziano con 978/979: altrimenti troppi numeri a caso.
    if not best and len(candidate) == 13:
      best = candidate
  return best


def is_junk_title(title: str) -> bool:
  cleaned = " ".join((title or "").split())
  return len(cleaned) < 2 or bool(JUNK_TITLE.match(cleaned))


def title_from_filename(path: str) -> str:
  stem = Path(path).stem
  stem = re.sub(r"[_\.]+", " ", stem)
  return " ".join(stem.split()) or "Senza titolo"


def plain_text(value: str) -> str:
  """Descrizioni EPUB spesso in HTML: solo testo."""
  value = re.sub(r"<\s*(?:br|/p|/div)\s*/?>", "\n", value or "", flags=re.IGNORECASE)
  value = html.unescape(re.sub(r"<[^>]+>", "", value))
  paragraphs = [" ".join(line.split()) for line in value.split("\n")]
  return "\n".join(line for line in paragraphs if line).strip()


PLACEHOLDERS = {"(unspecified)", "unspecified", "unknown", "none", "n/a", "na", "-", "null", "undefined", "sconosciuto"}


def clean_info(info: dict) -> dict:
  """Toglie i campi vuoti o segnaposto; le liste restano liste di stringhe senza doppioni."""
  result: dict = {}
  for key, value in info.items():
    if isinstance(value, list):
      seen: list[str] = []
      for item in value:
        item = " ".join(str(item).split())
        if item and item.lower() not in PLACEHOLDERS and item.lower() not in (s.lower() for s in seen):
          seen.append(item)
      if seen:
        result[key] = seen
    elif value is not None and str(value).strip() and str(value).strip().lower() not in PLACEHOLDERS:
      result[key] = str(value).strip()
  return result
