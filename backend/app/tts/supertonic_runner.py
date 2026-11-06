from __future__ import annotations

import os
import subprocess
import threading
import time
import traceback
from pathlib import Path
from typing import Any

from app.tts.base import TtsAdapter
from app.tts.language_detection import resolve_tts_language

# Supertonic-3 ships these 10 built-in voices. No reference recording needed:
# the user can pick one directly. Custom voices (Voice Builder JSON) are also
# supported via `voiceStylePath`.
SUPERTONIC_PRESET_VOICES = ("F1", "F2", "F3", "F4", "F5", "M1", "M2", "M3", "M4", "M5")
DEFAULT_VOICE = "F1"

# Languages Supertonic-3 can speak. Our own detector only separates it/en, but
# the user can force any of these explicitly from settings.
SUPERTONIC_LANGUAGES = (
  "en", "ko", "ja", "ar", "bg", "cs", "da", "de", "el", "es", "et", "fi", "fr",
  "hi", "hr", "hu", "id", "it", "lt", "lv", "nl", "pl", "pt", "ro", "ru", "sk",
  "sl", "sv", "tr", "uk", "vi", "na"
)

MIN_STEPS = 4
MAX_STEPS = 16
DEFAULT_STEPS = 8


def _detect_physical_cores() -> int:
  for key in ("hw.perflevel0.physicalcpu", "hw.physicalcpu"):
    try:
      out = subprocess.run(
        ["sysctl", "-n", key],
        capture_output=True,
        text=True,
        timeout=2
      )
      value = int(out.stdout.strip())
      if value > 0:
        return value
    except Exception:
      continue

  logical = os.cpu_count() or 2
  return max(1, logical // 2)


class SupertonicAdapter(TtsAdapter):
  """On-device ONNX TTS. Much faster than Qwen and needs no reference voice."""

  engine_name = "supertonic"
  supports_parallel = True

  def __init__(self) -> None:
    self.model_name = os.getenv("GRILLO_SUPERTONIC_MODEL", "supertonic-3")
    self.model_dir = os.getenv("GRILLO_SUPERTONIC_MODEL_DIR", "").strip() or None
    self.physical_cores = _detect_physical_cores()
    self.workers = self._resolve_workers()
    self.intra_threads = self._resolve_intra_threads()

    self._local = threading.local()
    self._notice_lock = threading.Lock()
    self._auto_language_notices: set[str] = set()
    self._missing_custom_voice_notice = False

  # --- parallelism -------------------------------------------------------

  def preferred_workers(self, settings: dict) -> int:
    return self.workers

  def warmup(self) -> None:
    # Build one session on the calling thread so the model is fetched/cached
    # once before parallel workers spin up their own sessions.
    self._get_tts()

  def _resolve_workers(self) -> int:
    configured = os.getenv("GRILLO_SUPERTONIC_WORKERS", "").strip()
    if configured:
      try:
        return max(1, int(configured))
      except ValueError:
        pass

    return max(1, min(4, self.physical_cores))

  def _resolve_intra_threads(self) -> int | None:
    configured = os.getenv("GRILLO_SUPERTONIC_INTRA_THREADS", "").strip()
    if configured:
      try:
        return max(1, int(configured))
      except ValueError:
        pass

    if self.workers <= 1:
      # Single worker: let ONNX Runtime use the whole machine.
      return None

    # Split physical cores across workers so we don't oversubscribe.
    return max(1, self.physical_cores // self.workers)

  # --- model / voice -----------------------------------------------------

  def _get_tts(self) -> Any:
    tts = getattr(self._local, "tts", None)
    if tts is not None:
      return tts

    from supertonic import TTS

    started_at = time.perf_counter()
    print(
      f"[supertonic] model-load-start model={self.model_name} "
      f"intra_threads={self.intra_threads} thread={threading.get_ident()}",
      flush=True
    )
    kwargs: dict[str, Any] = {"auto_download": True}
    if self.model_dir:
      kwargs["model_dir"] = self.model_dir
    if self.intra_threads is not None:
      kwargs["intra_op_num_threads"] = self.intra_threads

    tts = TTS(self.model_name, **kwargs)
    self._local.tts = tts
    self._local.style_cache = {}
    print(
      f"[supertonic] model-load-ready elapsed={time.perf_counter() - started_at:.2f}s "
      f"thread={threading.get_ident()}",
      flush=True
    )
    return tts

  def _resolve_voice_style(self, tts: Any, settings: dict) -> Any:
    tts_settings = settings["tts"]
    custom_path = str(tts_settings.get("voiceStylePath", "")).strip()
    cache: dict[str, Any] = getattr(self._local, "style_cache", {})

    if custom_path:
      resolved = Path(custom_path).expanduser()
      if resolved.exists():
        key = f"path:{resolved}"
        cached = cache.get(key)
        if cached is None:
          cached = tts.get_voice_style_from_path(str(resolved))
          cache[key] = cached
        return cached

      with self._notice_lock:
        self._missing_custom_voice_notice = True

    voice_name = str(tts_settings.get("voiceStyle", "") or "").strip() or DEFAULT_VOICE
    if voice_name not in SUPERTONIC_PRESET_VOICES:
      voice_name = DEFAULT_VOICE

    key = f"voice:{voice_name}"
    cached = cache.get(key)
    if cached is None:
      cached = tts.get_voice_style(voice_name)
      cache[key] = cached
    return cached

  def _resolve_steps(self, settings: dict) -> int:
    raw = settings["tts"].get("qualitySteps")
    if raw is None:
      raw = os.getenv("GRILLO_SUPERTONIC_STEPS", "").strip() or DEFAULT_STEPS
    try:
      steps = int(raw)
    except (TypeError, ValueError):
      steps = DEFAULT_STEPS
    return max(MIN_STEPS, min(MAX_STEPS, steps))

  def _resolve_speed(self, settings: dict) -> float:
    try:
      speed = float(settings["tts"].get("speakingSpeed", 1.0) or 1.0)
    except (TypeError, ValueError):
      speed = 1.0
    return max(0.5, min(2.0, speed))

  def _resolve_language(self, text: str, settings: dict) -> tuple[str, bool]:
    configured = str(settings["tts"].get("language", "auto"))
    if configured.strip().lower() in SUPERTONIC_LANGUAGES:
      return configured.strip().lower(), False

    language, detected = resolve_tts_language(text, configured)
    return language, detected

  # --- synthesis ---------------------------------------------------------

  def synthesize(self, text: str, output_path: Path, settings: dict) -> list[str]:
    try:
      started_at = time.perf_counter()
      tts = self._get_tts()
      style = self._resolve_voice_style(tts, settings)
      language, detected_automatically = self._resolve_language(text, settings)
      steps = self._resolve_steps(settings)
      speed = self._resolve_speed(settings)

      output_path.parent.mkdir(parents=True, exist_ok=True)
      wav, _duration = tts.synthesize(
        text=text,
        voice_style=style,
        lang=language,
        total_steps=steps,
        speed=speed
      )
      tts.save_audio(wav, str(output_path))

      audio_seconds = self._audio_seconds(wav)
      print(
        f"[supertonic] synth-done file={output_path.name} chars={len(text)} "
        f"language={language} steps={steps} speed={speed:.2f} "
        f"elapsed={time.perf_counter() - started_at:.2f}s audio={audio_seconds:.2f}s",
        flush=True
      )

      return self._collect_warnings(language, detected_automatically)
    except Exception as error:
      raise RuntimeError(self._format_debug_error(error, settings, output_path)) from error

  def _audio_seconds(self, wav: Any) -> float:
    try:
      samples = wav.squeeze().shape[0]
      return samples / 44100.0
    except Exception:
      return 0.0

  def _collect_warnings(self, language: str, detected_automatically: bool) -> list[str]:
    warnings: list[str] = []

    with self._notice_lock:
      if self._missing_custom_voice_notice:
        self._missing_custom_voice_notice = False
        warnings.append(
          "La voce personalizzata indicata non e stata trovata: uso una voce preset Supertonic."
        )

      if detected_automatically and language not in self._auto_language_notices:
        self._auto_language_notices.add(language)
        label = {"it": "italiano", "en": "inglese"}.get(language, language)
        warnings.append(f"Lingua rilevata automaticamente per il TTS: {label}.")

    return warnings

  def _format_debug_error(self, error: Exception, settings: dict, output_path: Path) -> str:
    tts_settings = settings["tts"]
    debug_lines = [
      f"{type(error).__name__}: {error}",
      f"engine=supertonic model={self.model_name}",
      f"workers={self.workers} intra_threads={self.intra_threads}",
      f"voiceStyle={tts_settings.get('voiceStyle', '<default>')}",
      f"voiceStylePath={tts_settings.get('voiceStylePath', '') or '<none>'}",
      f"output_path={output_path}",
      "traceback:",
      traceback.format_exc().strip()
    ]
    return "\n".join(debug_lines)
