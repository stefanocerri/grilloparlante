from __future__ import annotations

from app.tts.base import TtsAdapter
from app.tts.placeholder_tts import PlaceholderTtsAdapter


def create_tts_adapter(settings: dict) -> TtsAdapter:
  engine = str(settings.get("tts", {}).get("engine", "supertonic") or "supertonic").strip().lower()

  if engine == "supertonic":
    from app.tts.supertonic_runner import SupertonicAdapter
    return SupertonicAdapter()

  if engine in {"qwen", "xtts"}:
    from app.tts.qwen_runner import QwenAdapter
    return QwenAdapter()

  if engine == "placeholder":
    return PlaceholderTtsAdapter()

  raise RuntimeError(f"Unsupported TTS engine: {engine}")
