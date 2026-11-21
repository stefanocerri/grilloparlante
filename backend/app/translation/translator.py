"""Traduttore: TranslateGemma (Google) in versione MLX a 4 bit, sulla GPU dei Mac con chip Apple.

Perché questo modello: provato su un capitolo di romanzo contro Opus-MT e NLLB (traduttori «classici», frase per
frase) e contro la versione più grande. I classici fanno parlare al maschile una narratrice, lasciano parole in
inglese e sbagliano le concordanze; TranslateGemma traduce un paragrafo alla volta tenendo il filo. Il 12B è il più
fedele (circa 6,7 GB), il 4B va bene e pesa un terzo (circa 2,2 GB): si sceglie da solo in base alla memoria del Mac.

Come traduce: un paragrafo alla volta, con il paragrafo precedente e la sua traduzione davanti come turno già fatto
della conversazione. Così il modello sa chi parla, il genere di chi racconta, il tu o il lei dei dialoghi.
Il formato della richiesta è quello del modello (chat_template di TranslateGemma): non accetta istruzioni libere.
"""

from __future__ import annotations

import gc
import os
import platform
import re
import subprocess
import sys
import time
from typing import Callable, Protocol

from app.language import language_name

MODELS = {
  "4b": {"id": "mlx-community/translategemma-4b-it-4bit", "gb": 2.2},
  "12b": {"id": "mlx-community/translategemma-12b-it-4bit", "gb": 6.7},
}
# Da questa memoria in su il 12B: con 16 GB entra comodo (la voce si carica solo dopo, a traduzione finita).
BIG_MODEL_MIN_RAM_GB = 15.0
MLX_REQUIREMENT = "mlx-lm>=0.29"

# Un paragrafo più lungo di così si traduce a pezzi (sempre a fine frase): i modelli piccoli su testi lunghi
# tendono a riassumere o a ripetersi.
MAX_PIECE_CHARS = 1400

# Nomi delle lingue come li scrive il chat_template di TranslateGemma.
_TEMPLATE_NAMES = {"it": "Italian", "en": "English", "fr": "French", "es": "Spanish", "de": "German", "pt": "Portuguese"}

_SCENE_MARK = re.compile(r"^\s*(?:[*#~_=•·-]\s*){3,}$")
_SENTENCE_END = re.compile(r"(?<=[.!?…])[\"”’»)]*\s+(?=[\"“‘«(]?[A-ZÀ-Ý])")


class TranslationUnavailable(RuntimeError):
  pass


def ram_gb() -> float:
  try:
    return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 2**30
  except (ValueError, OSError, AttributeError):
    return 8.0


def choose_model(memory_gb: float | None = None) -> str:
  """«12b» con almeno 16 GB di memoria, altrimenti «4b». GRILLO_TRADUTTORE=4b|12b lo impone."""
  forced = os.getenv("GRILLO_TRADUTTORE", "").strip().lower()
  if forced in MODELS:
    return forced
  return "12b" if (ram_gb() if memory_gb is None else memory_gb) >= BIG_MODEL_MIN_RAM_GB else "4b"


def build_prompt(text: str, source: str, target: str = "it", context: tuple[str, str] | None = None) -> str:
  """Richiesta nel formato di TranslateGemma (senza <bos>, che aggiunge il tokenizer)."""
  src = _TEMPLATE_NAMES.get(source, language_name(source).title())
  tgt = _TEMPLATE_NAMES.get(target, language_name(target).title())

  def user(body: str) -> str:
    return (
      f"<start_of_turn>user\nYou are a professional {src} ({source}) to {tgt} ({target}) translator. Your goal is to "
      f"accurately convey the meaning and nuances of the original {src} text while adhering to {tgt} grammar, "
      f"vocabulary, and cultural sensitivities.\nProduce only the {tgt} translation, without any additional "
      f"explanations or commentary. Please translate the following {src} text into {tgt}:\n\n\n{body.strip()}"
      "<end_of_turn>\n"
    )

  prompt = ""
  if context:
    prompt += user(context[0]) + f"<start_of_turn>model\n{context[1].strip()}<end_of_turn>\n"
  return prompt + user(text) + "<start_of_turn>model\n"


def is_translatable(paragraph: str) -> bool:
  """I cambi di scena («***») e le righe senza lettere restano come sono."""
  return bool(re.search(r"[^\W\d_]", paragraph)) and not _SCENE_MARK.match(paragraph)


def split_pieces(paragraph: str, limit: int = MAX_PIECE_CHARS) -> list[str]:
  """Un paragrafo lungo diviso a fine frase in pezzi entro `limit` (una frase sola più lunga resta intera)."""
  if len(paragraph) <= limit:
    return [paragraph]
  pieces: list[str] = []
  current = ""
  for sentence in _SENTENCE_END.split(paragraph):
    candidate = f"{current} {sentence}" if current else sentence
    if current and len(candidate) > limit:
      pieces.append(current)
      current = sentence
    else:
      current = candidate
  if current:
    pieces.append(current)
  return pieces


def clean_output(text: str) -> str:
  text = text.split("<end_of_turn>")[0]
  return text.strip()


def looks_broken(source: str, output: str) -> bool:
  """Traduzione da rifare: vuota, molto più lunga dell'originale (il modello si ripete) o molto più corta."""
  if not output:
    return True
  ratio = len(output) / max(len(source), 1)
  return ratio > 2.5 and len(output) > 80 or ratio < 0.3 and len(source) > 60


class Backend(Protocol):
  def generate(self, prompt: str, max_tokens: int) -> str: ...

  def close(self) -> None: ...


class MlxBackend:
  """TranslateGemma con mlx-lm. Il modello si scarica da Hugging Face la prima volta."""

  def __init__(self, model_id: str, log: Callable[[str], None]) -> None:
    mlx_lm = _import_mlx_lm(log)
    self._mlx_lm = mlx_lm
    self.model, self.tokenizer = mlx_lm.load(model_id)
    self._bos = getattr(self.tokenizer, "bos_token_id", None)

  def generate(self, prompt: str, max_tokens: int) -> str:
    ids = self.tokenizer.encode(prompt, add_special_tokens=False)
    if self._bos is not None:
      ids = [self._bos] + ids
    return self._mlx_lm.generate(self.model, self.tokenizer, prompt=ids, max_tokens=max_tokens, verbose=False)

  def close(self) -> None:
    self.model = None
    self.tokenizer = None
    gc.collect()
    try:
      import mlx.core as mx

      mx.clear_cache()
    except Exception:  # pragma: no cover - solo pulizia
      pass


def _import_mlx_lm(log: Callable[[str], None]):
  try:
    import mlx_lm

    return mlx_lm
  except ImportError:
    pass
  if sys.platform != "darwin" or platform.machine() != "arm64":
    raise TranslationUnavailable("La traduzione richiede un Mac con chip Apple (M1 o successivi).")
  # Narratore installato prima della traduzione: il pacchetto si aggiunge ora, una volta sola.
  log("Installo il traduttore (mlx-lm, una volta sola)")
  completed = subprocess.run(
    [sys.executable, "-m", "pip", "install", MLX_REQUIREMENT], capture_output=True, text=True
  )
  if completed.returncode != 0:
    raise TranslationUnavailable(
      "Non riesco a installare il traduttore: " + (completed.stderr or completed.stdout).strip()[-500:]
    )
  import importlib

  importlib.invalidate_caches()
  import mlx_lm

  return mlx_lm


def model_downloaded(model_id: str) -> bool:
  try:
    from huggingface_hub import try_to_load_from_cache

    return isinstance(try_to_load_from_cache(model_id, "config.json"), str)
  except Exception:
    return False


class Translator:
  """Traduce paragrafi dalla lingua `source` all'italiano. Il modello si carica alla prima richiesta."""

  def __init__(
    self,
    source: str,
    target: str = "it",
    size: str | None = None,
    log: Callable[[str], None] = print,
    backend_factory: Callable[[str, Callable[[str], None]], Backend] | None = None,
  ) -> None:
    self.source = source
    self.target = target
    self.size = size or choose_model()
    self.model_id = MODELS[self.size]["id"]
    self.log = log
    self._factory = backend_factory or (lambda model_id, log: MlxBackend(model_id, log))
    self._backend: Backend | None = None

  @property
  def label(self) -> str:
    return f"{self.model_id}:{self.source}>{self.target}"

  def load(self) -> None:
    if self._backend is not None:
      return
    started = time.perf_counter()
    if not model_downloaded(self.model_id):
      self.log(f"Scarico il traduttore TranslateGemma {self.size.upper()} (circa {MODELS[self.size]['gb']:.1f} GB, solo la prima volta)")
    else:
      self.log(f"Carico il traduttore TranslateGemma {self.size.upper()}")
    self._backend = self._factory(self.model_id, self.log)
    self.log(f"Traduttore pronto in {time.perf_counter() - started:.0f}s")

  def translate(self, text: str, context: tuple[str, str] | None = None) -> str:
    """Un paragrafo (anche lungo: si divide da solo). `context`: paragrafo precedente e sua traduzione."""
    if not is_translatable(text):
      return text
    self.load()
    parts: list[str] = []
    for piece in split_pieces(text.strip()):
      translated = self._translate_piece(piece, context)
      parts.append(translated)
      context = (piece, translated)
    return " ".join(parts)

  def _translate_piece(self, piece: str, context: tuple[str, str] | None) -> str:
    assert self._backend is not None
    # Una parola italiana sta in circa 3,5 caratteri per token: il doppio dei caratteri di partenza basta e avanza.
    max_tokens = 64 + len(piece) // 2
    output = clean_output(self._backend.generate(build_prompt(piece, self.source, self.target, context), max_tokens))
    if looks_broken(piece, output):
      # Di solito è il contesto a confonderlo (ripete il paragrafo prima): si riprova senza.
      again = clean_output(self._backend.generate(build_prompt(piece, self.source, self.target), max_tokens))
      if not looks_broken(piece, again) or not output:
        output = again
    return output or piece

  def close(self) -> None:
    if self._backend is not None:
      self._backend.close()
      self._backend = None
