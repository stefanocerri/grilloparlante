"""Traduzione dei capitoli di un libro già importato.

Per ogni capitolo:
  text/original/NNN.txt   il testo nella lingua del libro (copiato la prima volta, poi non si tocca più)
  text/NNN.txt            sostituito dalla traduzione: è quello che legge la voce, che mostra la Libreria e che va
                          alle app collegate
  work/traduzione/NNN.json  paragrafi già tradotti: se l'app si chiude a metà, si riparte da lì

Nel book.json il capitolo prende `translated: true` e `originalTitle`; `title`, `chars` e la durata stimata
diventano quelli del testo italiano.
"""

from __future__ import annotations

import json
import re
import shutil
from typing import Callable

from app.library import BookStore
from app.translation.translator import Translator, is_translatable
from app.utils.events import EventEmitter
from app.utils.files import slugify

ProgressFn = Callable[[float, str, int, float], None]


def original_file(store: BookStore, index: int):
  return store.dir / "text" / "original" / f"{index:03d}.txt"


def cache_file(store: BookStore, index: int):
  return store.work_dir / "traduzione" / f"{index:03d}.json"


def needs_translation(book: dict, entry: dict) -> bool:
  return bool(book.get("translate")) and not entry.get("translated")


def paragraphs_of(text: str) -> list[str]:
  return [block.strip() for block in text.split("\n\n") if block.strip()]


def _translatable_title(title: str) -> bool:
  # «Parte 3» la generiamo noi dividendo un libro senza capitoli: è già italiano.
  return bool(re.search(r"[^\W\d_]", title)) and not slugify(title).startswith("parte-")


def translate_chapters(
  store: BookStore,
  book: dict,
  indexes: list[int],
  emitter: EventEmitter,
  check_cancelled: Callable[[], None],
  progress: ProgressFn,
  translator: Translator | None = None,
) -> int:
  """Traduce i capitoli `indexes` non ancora tradotti. Restituisce quanti ne ha tradotti."""
  from app.jobs.import_job import estimate_minutes

  entries = {entry["index"]: entry for entry in book["chapters"]}
  todo = [entries[index] for index in sorted(set(indexes)) if index in entries and needs_translation(book, entries[index])]
  if not todo:
    return 0
  source = book.get("language") or "en"
  translator = translator or Translator(source, log=lambda message: emitter.log("info", message))
  emitter.log("info", f"Traduco {len(todo)} capitoli in italiano con TranslateGemma {translator.size.upper()}")

  # Peso di ogni capitolo nella barra: i suoi caratteri.
  sizes = {}
  for entry in todo:
    if not original_file(store, entry["index"]).exists():
      original_file(store, entry["index"]).parent.mkdir(parents=True, exist_ok=True)
      shutil.copyfile(store.text_file(entry["index"]), original_file(store, entry["index"]))
    sizes[entry["index"]] = len(original_file(store, entry["index"]).read_text(encoding="utf-8")) or 1
  total = sum(sizes.values())
  done_before = 0

  try:
    for position, entry in enumerate(todo, start=1):
      index = entry["index"]
      label = f"Traduco il capitolo {index} ({position}/{len(todo)}): {entry.get('originalTitle') or entry['title']}"
      paragraphs = paragraphs_of(original_file(store, index).read_text(encoding="utf-8"))
      cache = _load_cache(store, index, translator.label)
      translated: list[str] = cache["paragraphs"]
      chars_done = sum(len(p) for p in paragraphs[: len(translated)])
      progress((done_before + chars_done) / total, label, index, chars_done / sizes[index])

      for position_in_chapter in range(len(translated), len(paragraphs)):
        check_cancelled()
        paragraph = paragraphs[position_in_chapter]
        context = _context(paragraphs, translated, position_in_chapter)
        translated.append(translator.translate(paragraph, context))
        _save_cache(store, index, cache)
        chars_done += len(paragraph)
        progress((done_before + chars_done) / total, label, index, chars_done / sizes[index])

      title = entry.get("originalTitle") or entry["title"]
      if "title" not in cache:
        check_cancelled()
        cache["title"] = translator.translate(title).strip().rstrip(".") if _translatable_title(title) else title
        _save_cache(store, index, cache)

      text = "\n\n".join(translated)
      store.text_file(index).write_text(text, encoding="utf-8")
      entry.update({
        "originalTitle": title,
        "title": cache["title"] or title,
        "translated": True,
        "chars": len(text),
        "estimatedMinutes": estimate_minutes(len(text), book.get("speed", 1.0)),
      })
      store.save(book)
      cache_file(store, index).unlink(missing_ok=True)
      done_before += sizes[index]
      emitter.emit("translated", {"bookId": book["id"], "index": index, "title": entry["title"]})
  finally:
    translator.close()
  return len(todo)


def _context(paragraphs: list[str], translated: list[str], position: int) -> tuple[str, str] | None:
  """Il paragrafo traducibile più vicino prima di questo, con la sua traduzione (i «***» non servono)."""
  for previous in range(position - 1, -1, -1):
    if is_translatable(paragraphs[previous]):
      return paragraphs[previous], translated[previous]
  return None


def _load_cache(store: BookStore, index: int, label: str) -> dict:
  try:
    cache = json.loads(cache_file(store, index).read_text(encoding="utf-8"))
    if cache.get("model") == label and isinstance(cache.get("paragraphs"), list):
      return cache
  except (OSError, ValueError):
    pass
  return {"model": label, "paragraphs": []}


def _save_cache(store: BookStore, index: int, cache: dict) -> None:
  path = cache_file(store, index)
  path.parent.mkdir(parents=True, exist_ok=True)
  partial = path.with_suffix(".json.part")
  partial.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
  partial.replace(path)


def set_translation(store: BookStore, enabled: bool) -> dict:
  """Accende o spegne la traduzione di un libro. Spegnendola i capitoli tornano al testo originale.
  Non si cambia con capitoli già convertiti: avrebbero l'audio nell'altra lingua."""
  book = store.load()
  source = book.get("language") or "it"
  if enabled and source == "it":
    raise RuntimeError("Il libro è già in italiano.")
  if any(entry.get("status") in ("ready", "converting") for entry in book["chapters"]):
    raise RuntimeError("Ci sono capitoli già convertiti: per cambiare lingua elimina il libro e importalo di nuovo.")
  book["translate"] = bool(enabled)
  if not enabled:
    for entry in book["chapters"]:
      if not entry.get("translated"):
        continue
      original = original_file(store, entry["index"])
      if original.exists():
        text = original.read_text(encoding="utf-8")
        store.text_file(entry["index"]).write_text(text, encoding="utf-8")
        entry["chars"] = len(text)
      from app.jobs.import_job import estimate_minutes

      entry["estimatedMinutes"] = estimate_minutes(entry["chars"], book.get("speed", 1.0))
      entry["title"] = entry.pop("originalTitle", entry["title"])
      entry.pop("translated", None)
  # I pezzi audio lasciati a metà sono nell'altra lingua.
  for leftover in store.work_dir.glob("*.wav"):
    leftover.unlink(missing_ok=True)
  store.save(book)
  return book
