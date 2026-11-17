"""Rigenera le anteprime (<id>.preview.mp3) delle voci incluse, con le impostazioni di lettura attuali.

Da rifare quando cambia il campione di una voce:

  python backend/runtime/make_previews.py --voci morgaine,serena,stella

Senza --voci le rifà tutte.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.audio.montage import join_pieces  # noqa: E402
from app.audio.mp3 import write_mp3  # noqa: E402
from app.tts.omnivoice_engine import MODEL_ID, SAMPLE_RATE, OmniVoiceEngine, resolve_device, resolve_dtype  # noqa: E402
from app.voice_create import PREVIEW_TEXT  # noqa: E402
from app.voices import VOICES_DIR, list_voices  # noqa: E402


def main() -> None:
  parser = argparse.ArgumentParser(description="Anteprime delle voci incluse")
  parser.add_argument("--voci", default="", help="identificativi separati da virgola (vuoto = tutte)")
  parser.add_argument("--seme", type=int, default=1)
  args = parser.parse_args()
  wanted = {item for item in args.voci.split(",") if item}

  import torch
  from omnivoice import OmniVoice

  device = resolve_device()
  model = OmniVoice.from_pretrained(MODEL_ID, device_map=device, dtype=resolve_dtype(device))
  for voice in list_voices():
    if voice.custom or (wanted and voice.id not in wanted):
      continue
    torch.manual_seed(args.seme)
    engine = OmniVoiceEngine(voice, log=lambda message: None, model=model)
    audio = join_pieces([(engine.synthesize(PREVIEW_TEXT), 0.0)], engine.settings, SAMPLE_RATE)
    target = VOICES_DIR / f"{voice.id}.preview.mp3"
    seconds = write_mp3(audio, SAMPLE_RATE, target)
    print(f"{voice.name}: {target.name} ({seconds:.1f}s)", flush=True)


if __name__ == "__main__":
  main()
