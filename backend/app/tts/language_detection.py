from __future__ import annotations

import re

SUPPORTED_TTS_LANGUAGES = ("it", "en")

LANGUAGE_ALIASES = {
  "auto": "auto",
  "italiano": "it",
  "it": "it",
  "it-it": "it",
  "ita": "it",
  "inglese": "en",
  "english": "en",
  "en": "en",
  "en-us": "en",
  "en-gb": "en"
}

ITALIAN_STOPWORDS = {
  "a",
  "ad",
  "al",
  "alla",
  "anche",
  "che",
  "chi",
  "con",
  "come",
  "dei",
  "del",
  "della",
  "delle",
  "dopo",
  "e",
  "gli",
  "ha",
  "hai",
  "hanno",
  "il",
  "in",
  "io",
  "la",
  "le",
  "ma",
  "mi",
  "nel",
  "nella",
  "non",
  "per",
  "piu",
  "poi",
  "quale",
  "quando",
  "questa",
  "questo",
  "se",
  "si",
  "sono",
  "tra",
  "una",
  "uno"
}

ENGLISH_STOPWORDS = {
  "a",
  "about",
  "after",
  "all",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "because",
  "by",
  "for",
  "from",
  "have",
  "he",
  "her",
  "his",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "she",
  "that",
  "the",
  "their",
  "there",
  "they",
  "this",
  "to",
  "was",
  "we",
  "were",
  "with",
  "you",
  "your"
}

ITALIAN_SUFFIXES = ("zione", "zioni", "mente", "tore", "trice", "gli", "che", "chi", "tta")
ENGLISH_SUFFIXES = ("tion", "ing", "ness", "ment", "able", "ible", "ous", "edly")


def normalize_language(value: str | None) -> str:
  raw = (value or "").strip().lower()
  return LANGUAGE_ALIASES.get(raw, "auto")


def detect_text_language(text: str, fallback: str = "it") -> str:
  words = re.findall(r"[a-zA-ZÀ-ÿ']+", text.lower())
  if not words:
    return fallback

  sample = words[:400]
  scores = {
    "it": 0.0,
    "en": 0.0
  }

  for word in sample:
    if word in ITALIAN_STOPWORDS:
      scores["it"] += 2.2

    if word in ENGLISH_STOPWORDS:
      scores["en"] += 2.2

    if any(accent in word for accent in "àèéìòù"):
      scores["it"] += 1.4

    if word.endswith(ITALIAN_SUFFIXES):
      scores["it"] += 0.8

    if word.endswith(ENGLISH_SUFFIXES):
      scores["en"] += 0.8

    if "'" in word and word not in {"l'", "dell'"}:
      scores["en"] += 0.4

  if scores["it"] == scores["en"]:
    return fallback

  detected = max(scores, key=scores.get)
  margin = abs(scores["it"] - scores["en"])
  return detected if margin >= 1.0 else fallback


def resolve_tts_language(text: str, configured: str | None) -> tuple[str, bool]:
  normalized = normalize_language(configured)
  if normalized in SUPPORTED_TTS_LANGUAGES:
    return normalized, False

  return detect_text_language(text), True
