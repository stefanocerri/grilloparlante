from __future__ import annotations

import re

_HYPHEN_BREAK = re.compile(r"(\w)[-­]\s*\n\s*(\w)")
_SINGLE_NEWLINE = re.compile(r"(?<!\n)\n(?!\n)")
_PAGE_NUMBER_LINE = re.compile(r"^\s*\d{1,4}\s*$", re.MULTILINE)
_SPACES = re.compile(r"[ \t]{2,}")
# Separatori dei titoli ("Capitolo 1 · La lanterna"): la voce li rende con suoni a caso, meglio una pausa.
_SEPARATORS = re.compile(r"\s+[·•|¦–—]\s+")
# Richiami alle note: apici, oppure cifre attaccate alla punteggiatura ("conto.1 Poi").
_SUPERSCRIPTS = re.compile(r"[⁰¹²³⁴⁵⁶⁷⁸⁹]+")
_NOTE_AFTER_PUNCT = re.compile(r"(?:(?<=[^\W\d][.,;:!?»”)])|(?<=[.,;:!?][»”)]))\d{1,3}(?=\s|$)")
_NUMBER = re.compile(r"(?<![\w.,:/])\d{1,6}(?![\w]|[.,:/]\d)")

_UNITS = ["zero", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove", "dieci",
          "undici", "dodici", "tredici", "quattordici", "quindici", "sedici", "diciassette", "diciotto", "diciannove"]
_TENS = ["", "", "venti", "trenta", "quaranta", "cinquanta", "sessanta", "settanta", "ottanta", "novanta"]


def _below_thousand(n: int) -> str:
  if n < 20:
    return _UNITS[n]
  if n < 100:
    tens, unit = divmod(n, 10)
    word = _TENS[tens]
    if unit in (1, 8):
      word = word[:-1]  # ventuno, trentotto
    return word + (_UNITS[unit] if unit else "")
  hundreds, rest = divmod(n, 100)
  head = "cento" if hundreds == 1 else _UNITS[hundreds] + "cento"
  if rest == 8 or rest // 10 == 8:
    head = head[:-1]  # centottanta
  return head + (_below_thousand(rest) if rest else "")


def number_to_words(n: int) -> str:
  """Numero intero in lettere, all'italiana (1 -> uno, 1990 -> millenovecentonovanta)."""
  if n < 1000:
    return _below_thousand(n)
  thousands, rest = divmod(n, 1000)
  head = "mille" if thousands == 1 else _below_thousand(thousands) + "mila"
  return head + (_below_thousand(rest) if rest else "")


def clean_for_speech(text: str) -> str:
  """Ripulisce il testo estratto da PDF prima della lettura."""
  text = text.replace(" ", " ")
  text = _PAGE_NUMBER_LINE.sub("", text)
  text = _HYPHEN_BREAK.sub(r"\1\2", text)   # "pro-\nblema" -> "problema"
  text = _SINGLE_NEWLINE.sub(" ", text)     # a capo dentro il paragrafo -> spazio
  text = _SUPERSCRIPTS.sub("", text)
  text = _NOTE_AFTER_PUNCT.sub("", text)
  text = _SEPARATORS.sub(". ", text)
  # Le cifre le scriviamo noi in lettere: la voce le legge a modo suo ("Capitolo 1" diventava "Capitolo un").
  text = _NUMBER.sub(lambda match: number_to_words(int(match.group())), text)
  text = _SPACES.sub(" ", text)
  text = re.sub(r"\n{3,}", "\n\n", text)
  return text.strip()


def separate_title(text: str, title: str) -> str:
  """Se il capitolo comincia con il suo titolo, mette un punto dopo il titolo: altrimenti la voce lo attacca al testo."""
  spoken = clean_for_speech(title).rstrip()
  if not spoken or not text.startswith(spoken):
    return text
  rest = text[len(spoken):]
  if not rest or rest[0] in ".!?:;":
    return text
  return f"{spoken.rstrip('.')}.\n\n{rest.lstrip()}"
