"""Lingua del testo: dai metadati del file (EPUB, JSON) o, meglio, dal testo stesso.

Basta distinguere le lingue più comuni nei libri che arrivano a Grillo: si contano le parole brevi più frequenti di
ogni lingua (articoli, preposizioni, congiunzioni) in un campione del testo. I metadati vengono dopo perché spesso
sono sbagliati: molti programmi scrivono «en» in qualsiasi EPUB.
"""

from __future__ import annotations

import re

# Parole frequentissime e quasi esclusive di ogni lingua.
_STOPWORDS = {
  "it": "il lo la gli le di del della dei delle che non per una uno con sono questo questa anche come più ma era "
        "aveva alla nel nella sul sulla perché quando dove già",
  "en": "the and of to in is that it was for with as his her he she you they this but had not are be at by from "
        "which were have been would there their what when",
  "fr": "le la les des du un une et est que qui dans pour pas sur avec ce cette il elle sont mais ou au aux "
        "était avait nous vous leur",
  "es": "el la los las del un una y es que en por con para no se su sus pero como más era fue está esta este "
        "muy también cuando",
  "de": "der die das und ist nicht ein eine zu den mit von sich auf für dem des im auch es sie er war aber "
        "wie noch nach wenn",
  "pt": "o a os as do da dos das um uma e é que em no na por com para não se mais mas como foi era também "
        "quando ao",
}
_WORDS = {code: set(words.split()) for code, words in _STOPWORDS.items()}
_TOKEN = re.compile(r"[^\W\d_]+", re.UNICODE)

# Nomi e codici a tre lettere che si trovano nei metadati.
_ALIASES = {
  "ita": "it", "italian": "it", "italiano": "it",
  "eng": "en", "english": "en", "inglese": "en",
  "fra": "fr", "fre": "fr", "french": "fr", "français": "fr", "francese": "fr",
  "spa": "es", "spanish": "es", "español": "es", "spagnolo": "es",
  "deu": "de", "ger": "de", "german": "de", "deutsch": "de", "tedesco": "de",
  "por": "pt", "portuguese": "pt", "português": "pt", "portoghese": "pt",
}


def normalize_language(raw: str | None) -> str:
  """«en-US», «eng», «English» → «en». Stringa vuota se non è un codice riconoscibile."""
  value = (raw or "").strip().lower().replace("_", "-")
  if not value:
    return ""
  if value in _ALIASES:
    return _ALIASES[value]
  base = value.split("-")[0]
  if base in _ALIASES:
    return _ALIASES[base]
  return base if re.fullmatch(r"[a-z]{2}", base) else ""


def detect_language(text: str, hint: str | None = None, sample_chars: int = 20000) -> str:
  """Codice a due lettere della lingua del testo. Se il testo non basta per decidere vale il suggerimento dei
  metadati, e in mancanza anche di quello l'italiano."""
  sample = text[:sample_chars].lower()
  tokens = _TOKEN.findall(sample)
  if len(tokens) >= 30:
    scores = {code: sum(1 for token in tokens if token in words) for code, words in _WORDS.items()}
    best = max(scores, key=scores.get)
    ranked = sorted(scores.values(), reverse=True)
    # Deciso solo se le parole tipiche sono tante e la prima lingua stacca bene la seconda.
    if ranked[0] >= max(8, len(tokens) * 0.08) and ranked[0] >= ranked[1] * 1.3:
      return best
  return normalize_language(hint) or "it"


LANGUAGE_NAMES = {"it": "italiano", "en": "inglese", "fr": "francese", "es": "spagnolo", "de": "tedesco", "pt": "portoghese"}


def language_name(code: str) -> str:
  return LANGUAGE_NAMES.get(code, code)
