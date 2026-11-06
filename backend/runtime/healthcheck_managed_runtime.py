"""Controlla che il runtime gestito abbia tutto il necessario. Stampa una riga JSON."""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))


def main() -> int:
  result: dict = {"ok": False}
  try:
    import lameenc  # noqa: F401
    import omnivoice  # noqa: F401
    import pypdf  # noqa: F401
    import soundfile  # noqa: F401
    import torch

    from app.tts.omnivoice_engine import resolve_device

    result.update({"ok": True, "device": resolve_device(), "torch": torch.__version__})
  except Exception as error:  # pragma: no cover - confine del runtime
    result["error"] = f"{type(error).__name__}: {error}"

  print(json.dumps(result), flush=True)
  return 0 if result["ok"] else 1


if __name__ == "__main__":
  raise SystemExit(main())
