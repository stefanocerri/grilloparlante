from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def emit(step: str, message: str, progress: float, detail: str | None = None) -> None:
  payload = {
    "type": "progress",
    "payload": {
      "state": "installing",
      "step": step,
      "message": message,
      "progress": round(progress, 4)
    },
    "timestamp": datetime.now(timezone.utc).isoformat()
  }

  if detail:
    payload["payload"]["detail"] = detail

  print(json.dumps(payload, ensure_ascii=False), flush=True)


def build_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(description="Install the managed Qwen runtime.")
  parser.add_argument("--runtime-dir", required=True)
  parser.add_argument("--backend-root", required=True)
  parser.add_argument("--app-version", required=True)
  parser.add_argument("--arch", required=True)
  return parser


def run_checked(command: list[str], cwd: Path, step: str, message: str, progress: float) -> None:
  emit(step, message, progress, " ".join(command))
  completed = subprocess.run(
    command,
    cwd=str(cwd),
    env={
      **os.environ,
      "COQUI_TOS_AGREED": "1",
      "NUMBA_DISABLE_JIT": "1",
      "PYTHONWARNINGS": "ignore:pkg_resources is deprecated as an API:UserWarning"
    },
    capture_output=True,
    text=True
  )

  if completed.returncode != 0:
    stdout = completed.stdout.strip()
    stderr = completed.stderr.strip()
    detail = "Unknown installer failure."

    if stdout:
      try:
        parsed_stdout = json.loads(stdout)
        detail = str(parsed_stdout.get("error") or parsed_stdout)
      except Exception:
        detail = stdout

    if stderr:
      detail = f"{detail}\n{stderr}" if detail and detail != "Unknown installer failure." else stderr

    raise RuntimeError(f"{message} failed: {detail}")


def read_python_version(python_path: Path) -> tuple[int, int, int] | None:
  completed = subprocess.run(
    [
      str(python_path),
      "-c",
      "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}')"
    ],
    capture_output=True,
    text=True
  )

  if completed.returncode != 0:
    return None

  raw = completed.stdout.strip()
  try:
    major, minor, patch = (int(part) for part in raw.split("."))
  except ValueError:
    return None

  return major, minor, patch


def main() -> int:
  parser = build_parser()
  args = parser.parse_args()

  if sys.version_info < (3, 11):
    failure = {
      "type": "progress",
      "payload": {
        "state": "error",
        "step": "bootstrap",
        "message": "Installazione runtime non riuscita.",
        "detail": (
          f"Python {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro} trovato, "
          "ma il runtime Qwen richiede Python >= 3.11. Installa python@3.11 o imposta "
          "GRILLO_BOOTSTRAP_PYTHON_PATH verso un Python compatibile."
        ),
        "progress": 1.0
      },
      "timestamp": datetime.now(timezone.utc).isoformat()
    }
    print(json.dumps(failure, ensure_ascii=False), flush=True)
    return 1

  runtime_dir = Path(args.runtime_dir).expanduser().resolve()
  backend_root = Path(args.backend_root).expanduser().resolve()
  manifest_path = backend_root / "runtime" / "managed_runtime_manifest.json"
  runtime_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

  runtime_dir.mkdir(parents=True, exist_ok=True)
  logs_dir = runtime_dir / "logs"
  logs_dir.mkdir(parents=True, exist_ok=True)
  venv_dir = runtime_dir / "venv"
  venv_python = venv_dir / "bin" / "python"
  metadata_path = runtime_dir / "runtime.json"
  try:
    recreate_venv = False

    if venv_dir.exists() and not metadata_path.exists():
      emit(
        "bootstrap",
        "Ho trovato un runtime incompleto da un tentativo precedente, ricreo l'ambiente.",
        0.04
      )
      recreate_venv = True

    if venv_python.exists():
      existing_version = read_python_version(venv_python)
      if existing_version is None:
        emit("bootstrap", "Runtime esistente non leggibile, ricreo l'ambiente.", 0.04)
        recreate_venv = True
      elif existing_version < (3, 11, 0):
        emit(
          "bootstrap",
          "Runtime esistente usa un Python troppo vecchio, ricreo l'ambiente.",
          0.04,
          f"Trovato Python {existing_version[0]}.{existing_version[1]}.{existing_version[2]}"
        )
        recreate_venv = True
      elif existing_version[:2] != sys.version_info[:2]:
        emit(
          "bootstrap",
          "Runtime esistente creato con un'altra versione di Python, ricreo l'ambiente.",
          0.04,
          (
            f"Runtime {existing_version[0]}.{existing_version[1]}.{existing_version[2]}, "
            f"bootstrap {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
          )
        )
        recreate_venv = True

    if recreate_venv and venv_dir.exists():
      shutil.rmtree(venv_dir, ignore_errors=True)

    if not venv_python.exists():
      emit("bootstrap", "Preparazione ambiente Python dedicato.", 0.08)
      run_checked(
        [sys.executable, "-m", "venv", str(venv_dir)],
        backend_root,
        "bootstrap",
        "Creating managed virtual environment",
        0.12
      )

    emit("bootstrap", "Aggiornamento pip nel runtime gestito.", 0.18)
    run_checked(
      [str(venv_python), "-m", "pip", "install", "--upgrade", "pip", "wheel", "setuptools<81"],
      backend_root,
      "bootstrap",
      "Upgrading pip inside managed runtime",
      0.22
    )

    emit("deps", "Installazione dipendenze backend locali.", 0.3)
    run_checked(
      [str(venv_python), "-m", "pip", "install", "-r", str(backend_root / "requirements.txt")],
      backend_root,
      "deps",
      "Installing backend requirements",
      0.38
    )

    emit("deps", "Installazione dipendenze del motore voce Qwen.", 0.48)
    run_checked(
      [
        str(venv_python),
        "-m",
        "pip",
        "install",
        "-r",
        str(backend_root / "runtime" / "managed_tts_requirements.txt")
      ],
      backend_root,
      "deps",
      "Installing managed Qwen requirements",
      0.56
    )

    emit(
      "validate",
      "Verifica finale del runtime Qwen. Il modello completo verra scaricato al primo utilizzo.",
      0.78
    )
    run_checked(
      [
        str(venv_python),
        str(backend_root / "runtime" / "healthcheck_managed_runtime.py"),
        "--model-name",
        str(runtime_manifest.get("modelName", "Qwen/Qwen3-TTS-12Hz-0.6B-Base"))
      ],
      backend_root,
      "validate",
      "Validating managed runtime",
      0.94
    )

    metadata = {
      "runtimeId": runtime_manifest["runtimeId"],
      "runtimeVersion": runtime_manifest["runtimeVersion"],
      "appVersion": args.app_version,
      "arch": args.arch,
      "pythonPath": str(venv_python),
      "source": runtime_manifest.get("packageSpec", "managed-bootstrap"),
      "installedAt": datetime.now(timezone.utc).isoformat()
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    emit(
      "done",
      "Runtime vocale pronto. Il primo avvio della sintesi puo ancora richiedere qualche minuto per scaricare il modello Qwen.",
      1.0
    )
    return 0
  except Exception as error:  # pragma: no cover - installer boundary
    failure = {
      "type": "progress",
      "payload": {
        "state": "error",
        "step": "error",
        "message": "Installazione runtime non riuscita.",
        "detail": str(error),
        "progress": 1.0
      },
      "timestamp": datetime.now(timezone.utc).isoformat()
    }
    print(json.dumps(failure, ensure_ascii=False), flush=True)
    return 1


if __name__ == "__main__":
  raise SystemExit(main())
