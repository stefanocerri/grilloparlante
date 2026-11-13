"""I test girano dalla cartella backend o dalla radice: `python -m pytest backend/tests`."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
