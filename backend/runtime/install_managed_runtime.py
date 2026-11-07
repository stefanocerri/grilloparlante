"""Installa il motore voce in un ambiente Python dedicato (una volta sola).

Passi: venv -> dipendenze (requirements.txt) -> download modello OmniVoice -> verifica.
Ogni passo stampa una riga JSON di avanzamento che l'app mostra all'utente.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

MIN_PYTHON = (3, 10)


def emit(state: str, step: str, message: str, progress: float, detail: str | None = None) -> None:
  payload = {"state": state, "step": step, "message": message, "progress": round(progress, 3)}
  if detail:
    payload["detail"] = detail[-4000:]
  event = {"type": "progress", "payload": payload, "timestamp": datetime.now(timezone.utc).isoformat()}
  print(json.dumps(event, ensure_ascii=False), flush=True)


def run(command: list[str], cwd: Path, step: str, message: str, progress: float) -> None:
  emit("installing", step, message, progress)
  completed = subprocess.run(command, cwd=str(cwd), capture_output=True, text=True, env={**os.environ})
  if completed.returncode != 0:
    detail = (completed.stderr or completed.stdout or "").strip()
    raise RuntimeError(f"{message}: {detail[-2000:]}")


def main() -> int:
  parser = argparse.ArgumentParser(description="Installa il runtime OmniVoice.")
  parser.add_argument("--runtime-dir", required=True)
  parser.add_argument("--backend-root", required=True)
  parser.add_argument("--app-version", required=True)
  parser.add_argument("--arch", required=True)
  args = parser.parse_args()

  if sys.version_info < MIN_PYTHON:
    emit("error", "bootstrap", "Python troppo vecchio.", 1.0,
         f"Serve Python >= 3.10, trovato {sys.version.split()[0]}. Installa: brew install python@3.12")
    return 1

  runtime_dir = Path(args.runtime_dir).expanduser().resolve()
  backend_root = Path(args.backend_root).expanduser().resolve()
  venv_dir = runtime_dir / "venv"
  python = venv_dir / "bin" / "python"
  metadata_path = runtime_dir / "runtime.json"

  try:
    if venv_dir.exists() and not metadata_path.exists():
      shutil.rmtree(venv_dir, ignore_errors=True)  # tentativo precedente incompleto
    runtime_dir.mkdir(parents=True, exist_ok=True)

    if not python.exists():
      run([sys.executable, "-m", "venv", str(venv_dir)], backend_root, "venv", "Creo l'ambiente Python", 0.05)

    run([str(python), "-m", "pip", "install", "--upgrade", "pip", "wheel"], backend_root,
        "pip", "Aggiorno pip", 0.1)
    run([str(python), "-m", "pip", "install", "-r", str(backend_root / "requirements.txt")], backend_root,
        "deps", "Installo il motore voce (PyTorch e OmniVoice, qualche minuto)", 0.2)
    run([str(python), "-m", "app.cli", "prefetch"], backend_root,
        "model", "Scarico il modello vocale (circa 2,5 GB)", 0.6)
    run([str(python), str(backend_root / "runtime" / "healthcheck_managed_runtime.py")], backend_root,
        "check", "Verifica finale", 0.95)

    manifest = json.loads((backend_root / "runtime" / "managed_runtime_manifest.json").read_text())
    metadata_path.write_text(json.dumps({
      "runtimeId": manifest["runtimeId"],
      "runtimeVersion": manifest["runtimeVersion"],
      "appVersion": args.app_version,
      "arch": args.arch,
      "pythonPath": str(python),
      "installedAt": datetime.now(timezone.utc).isoformat(),
    }, indent=2), encoding="utf-8")
    emit("ready", "done", "Motore voce pronto.", 1.0)
    return 0
  except Exception as error:  # pragma: no cover - confine dell'installer
    emit("error", "error", "Installazione non riuscita.", 1.0, str(error))
    return 1


if __name__ == "__main__":
  raise SystemExit(main())
