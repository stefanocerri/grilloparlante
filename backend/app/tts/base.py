from __future__ import annotations

from pathlib import Path


class TtsAdapter:
  engine_name = "base"

  # Adapters that are cheap and thread-safe to call concurrently set this to
  # True so the conversion job can synthesize chunks in parallel.
  supports_parallel = False

  def synthesize(self, text: str, output_path: Path, settings: dict) -> list[str]:
    raise NotImplementedError

  def preferred_workers(self, settings: dict) -> int:
    """How many worker threads the pipeline may use for this engine."""
    return 1

  def warmup(self) -> None:
    """Optional one-time preparation before parallel synthesis starts."""
    return None
