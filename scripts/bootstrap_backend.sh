#!/usr/bin/env bash
# Prepara backend/.venv con OmniVoice e scarica il modello (una volta sola, circa 5 GB).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
VENV_DIR="$BACKEND_DIR/.venv"

# OmniVoice richiede Python >= 3.10 (il python3 di sistema del Mac e 3.9).
version_ok() {
  "$1" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null
}

PYTHON=""
for candidate in \
  "${GRILLO_BOOTSTRAP_PYTHON_PATH:-}" \
  python3.12 python3.11 python3.13 \
  /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.11 /opt/homebrew/bin/python3.13 \
  /usr/local/bin/python3.12 /usr/local/bin/python3.11 /usr/local/bin/python3.13 \
  python3; do
  if [ -n "$candidate" ] && command -v "$candidate" >/dev/null 2>&1 && version_ok "$candidate"; then
    PYTHON="$(command -v "$candidate")"
    break
  fi
done

if [ -z "$PYTHON" ]; then
  echo "Serve Python 3.10 o piu recente. Installalo con:"
  echo "  brew install python@3.12"
  echo "poi rilancia questo script."
  exit 1
fi

# Ambiente creato in passato con un Python troppo vecchio: lo ricreo.
if [ -x "$VENV_DIR/bin/python" ] && ! version_ok "$VENV_DIR/bin/python"; then
  echo "backend/.venv usa un Python troppo vecchio: lo ricreo con $PYTHON"
  rm -rf "$VENV_DIR"
fi

if [ ! -x "$VENV_DIR/bin/python" ]; then
  "$PYTHON" -m venv "$VENV_DIR"
fi

"$VENV_DIR/bin/python" -m pip install --upgrade pip
"$VENV_DIR/bin/python" -m pip install -r "$BACKEND_DIR/requirements.txt"
(cd "$BACKEND_DIR" && "$VENV_DIR/bin/python" -m app.cli prefetch)

echo "Backend pronto in $VENV_DIR ($("$VENV_DIR/bin/python" --version))"
