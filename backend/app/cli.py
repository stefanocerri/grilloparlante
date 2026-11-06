"""Backend locale di Grillo parlante.

  python -m app.cli import  --input libro.pdf --voice uomo_01 --library ~/Grillo
  python -m app.cli convert --book <id> --chapters 1,2,3 --library ~/Grillo
  python -m app.cli voices
  python -m app.cli prefetch      # scarica il modello OmniVoice
"""

from __future__ import annotations

import argparse
import json
import signal
import sys
import traceback

from app.utils.events import EventEmitter

cancel_requested = False


def _request_cancel(_signum: int, _frame: object) -> None:
  global cancel_requested
  cancel_requested = True


def parse_chapters(raw: str) -> list[int]:
  chapters: list[int] = []
  for part in raw.split(","):
    part = part.strip()
    if "-" in part:
      start, end = (int(value) for value in part.split("-", 1))
      chapters.extend(range(start, end + 1))
    elif part:
      chapters.append(int(part))
  return chapters


def build_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(description="Grillo parlante: PDF -> audiolibro.")
  sub = parser.add_subparsers(dest="command", required=True)

  importer = sub.add_parser("import", help="Estrae testo e capitoli da un PDF/EPUB.")
  importer.add_argument("--input", required=True)
  importer.add_argument("--voice", required=True)
  importer.add_argument("--speed", type=float, default=1.0)
  importer.add_argument("--library", required=True, help="Cartella della libreria.")

  convert = sub.add_parser("convert", help="Converte in audio i capitoli scelti.")
  convert.add_argument("--book", required=True)
  convert.add_argument("--chapters", required=True, help="Es. 1,2,5 oppure 1-4")
  convert.add_argument("--library", required=True)

  sub.add_parser("voices", help="Elenca le voci disponibili (JSON).")
  sub.add_parser("prefetch", help="Scarica il modello vocale.")
  return parser


def main(argv: list[str] | None = None) -> int:
  signal.signal(signal.SIGTERM, _request_cancel)
  signal.signal(signal.SIGINT, _request_cancel)
  emitter = EventEmitter()
  args = build_parser().parse_args(argv)

  if args.command == "voices":
    from app.voices import list_voices

    print(json.dumps([
      {"id": v.id, "name": v.name, "gender": v.gender, "description": v.description,
       "sample": str(v.sample_path), "preview": str(v.preview_path) if v.preview_path else None}
      for v in list_voices()
    ], ensure_ascii=False))
    return 0

  if args.command == "prefetch":
    from app.tts.omnivoice_engine import prefetch_model

    try:
      path = prefetch_model(lambda message: emitter.log("info", message))
      emitter.emit("result", {"modelPath": path})
      return 0
    except Exception as error:
      emitter.error("Download del modello non riuscito.", str(error))
      return 1

  from app.jobs.conversion_job import ConversionJob, JobCancelled

  try:
    if args.command == "import":
      from app.jobs.import_job import ImportJob

      ImportJob(args.input, args.voice, args.speed, args.library, emitter).run()
      return 0

    ConversionJob(
      book_id=args.book,
      chapters=parse_chapters(args.chapters),
      library_dir=args.library,
      emitter=emitter,
      is_cancelled=lambda: cancel_requested,
    ).run()
    return 0
  except JobCancelled:
    emitter.emit("cancelled", {})
    return 0
  except Exception as error:  # pragma: no cover - confine del processo
    emitter.error(str(error) or "Conversione non riuscita.", traceback.format_exc().strip())
    return 1


if __name__ == "__main__":
  sys.exit(main())
