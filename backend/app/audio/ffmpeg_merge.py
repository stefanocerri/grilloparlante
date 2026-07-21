from __future__ import annotations

import shutil
import subprocess
import tempfile
import wave
from pathlib import Path


def _merge_wav_files(inputs: list[Path], output_path: Path) -> None:
  with wave.open(str(inputs[0]), "rb") as first:
    params = first.getparams()
    frames = [first.readframes(first.getnframes())]

  for item in inputs[1:]:
    with wave.open(str(item), "rb") as current:
      if current.getparams()[:3] != params[:3]:
        raise RuntimeError("WAV merge fallback requires matching audio parameters.")
      frames.append(current.readframes(current.getnframes()))

  with wave.open(str(output_path), "wb") as destination:
    destination.setparams(params)
    for frame in frames:
      destination.writeframes(frame)


def merge_audio_chunks(
  inputs: list[Path],
  output_dir: Path,
  chapter_slug: str,
  preferred_format: str
) -> tuple[Path, list[str]]:
  output_dir.mkdir(parents=True, exist_ok=True)
  warnings: list[str] = []
  ffmpeg_path = shutil.which("ffmpeg")

  if ffmpeg_path:
    suffix = ".mp3" if preferred_format == "mp3" else ".wav"
    destination = output_dir / f"{chapter_slug}{suffix}"

    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as handle:
      for item in inputs:
        handle.write(f"file '{item.as_posix()}'\n")
      concat_file = Path(handle.name)

    command = [
      ffmpeg_path,
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      str(concat_file),
      "-vn",
      str(destination)
    ]

    try:
      subprocess.run(command, check=True, capture_output=True, text=True)
      return destination, warnings
    finally:
      concat_file.unlink(missing_ok=True)

  destination = output_dir / f"{chapter_slug}.wav"
  _merge_wav_files(inputs, destination)
  warnings.append(
    "ffmpeg was not found, so chapter merge fell back to WAV concatenation."
  )
  return destination, warnings
