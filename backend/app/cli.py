from __future__ import annotations

import argparse
import json
import signal
import sys
import traceback

from app.jobs.conversion_job import ConversionJob, JobCancelled
from app.utils.events import EventEmitter

cancel_requested = False


def _request_cancel(_signum: int, _frame: object) -> None:
  global cancel_requested
  cancel_requested = True


def build_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(description="Local audiobook conversion backend.")
  subparsers = parser.add_subparsers(dest="command", required=True)
  convert = subparsers.add_parser("convert", help="Convert a local file to audio output.")
  convert.add_argument("--input", required=True, help="Absolute path to the source file.")
  convert.add_argument(
    "--settings",
    default="{}",
    help="JSON encoded conversion settings."
  )
  return parser


def main(argv: list[str] | None = None) -> int:
  signal.signal(signal.SIGTERM, _request_cancel)
  signal.signal(signal.SIGINT, _request_cancel)
  emitter = EventEmitter()
  parser = build_parser()
  args = parser.parse_args(argv)

  if args.command != "convert":
    parser.print_help()
    return 1

  try:
    settings = json.loads(args.settings)
  except json.JSONDecodeError as error:
    emitter.error("Invalid settings payload.", str(error))
    return 1

  job = ConversionJob(
    input_path=args.input,
    raw_settings=settings,
    emitter=emitter,
    is_cancelled=lambda: cancel_requested
  )

  try:
    job.run()
    return 0
  except JobCancelled:
    emitter.emit("cancelled", {"jobId": job.job_id})
    return 0
  except Exception as error:  # pragma: no cover - final CLI boundary
    emitter.error("Conversion failed.", traceback.format_exc().strip())
    return 1


if __name__ == "__main__":
  sys.exit(main())
