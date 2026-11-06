from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
  sys.path.insert(0, str(BACKEND_ROOT))

from app.tts.runtime_bootstrap import prepare_third_party_runtime


def build_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(description="Validate the managed Qwen runtime.")
  parser.add_argument(
    "--model-name",
    required=False,
    default="Qwen/Qwen3-TTS-12Hz-0.6B-Base"
  )
  parser.add_argument("--reference-path", required=False, help="Optional default reference audio path.")
  return parser


def main() -> int:
  parser = build_parser()
  args = parser.parse_args()
  reference_path = Path(args.reference_path).expanduser().resolve() if args.reference_path else None
  runtime_root = reference_path.parent.parent if reference_path else None
  prepare_third_party_runtime(runtime_root)
  result = {
    "ok": False,
    "modules": []
  }

  try:
    import soundfile  # noqa: F401
    import torch  # noqa: F401
    from qwen_tts import Qwen3TTSModel  # noqa: F401

    result["modules"] = ["soundfile", "torch", "qwen_tts.Qwen3TTSModel"]

    if reference_path and not reference_path.exists():
      result["error"] = f"Default reference audio is missing at {reference_path}"
    else:
      result["ok"] = True
      result["modelName"] = args.model_name
      result["note"] = "Qwen package import ok. Model download is deferred to first synthesis."
      if reference_path:
        result["defaultReferencePath"] = str(reference_path)
  except Exception as error:  # pragma: no cover - runtime boundary
    result["error"] = str(error)

  print(json.dumps(result, ensure_ascii=False), flush=True)
  return 0 if result["ok"] else 1


if __name__ == "__main__":
  raise SystemExit(main())
