from __future__ import annotations

import os
import time
import traceback
from pathlib import Path
from typing import Any

from app.tts.base import TtsAdapter
from app.tts.language_detection import resolve_tts_language
from app.tts.placeholder_tts import PlaceholderTtsAdapter
from app.tts.runtime_bootstrap import prepare_third_party_runtime

QWEN_LANGUAGE_MAP = {
  "it": "Italian",
  "en": "English"
}


class QwenAdapter(TtsAdapter):
  engine_name = "qwen"

  def __init__(self) -> None:
    self.allow_fallback = os.getenv("GRILLO_ALLOW_PLACEHOLDER_FALLBACK", "0") == "1"
    self.model_name = os.getenv(
      "GRILLO_QWEN_MODEL",
      "Qwen/Qwen3-TTS-12Hz-0.6B-Base"
    )
    self.device = (os.getenv("GRILLO_QWEN_DEVICE", "").strip().lower() or "cpu")
    self.fallback = PlaceholderTtsAdapter()
    self._model: Any | None = None
    self._voice_prompt_cache: dict[tuple[str, str], Any] = {}
    self._speed_notice_emitted = False
    self._cpu_notice_emitted = False
    self._model_ready_logged = False
    self._auto_language_notices: set[str] = set()
    prepare_third_party_runtime()

  def synthesize(self, text: str, output_path: Path, settings: dict) -> list[str]:
    try:
      synth_started_at = time.perf_counter()
      reference_path = self._resolve_reference_audio(settings)
      if not reference_path:
        raise RuntimeError(
          "Qwen richiede un audio di riferimento reale. Seleziona un sample voce nelle impostazioni."
        )

      reference_text = self._resolve_reference_text(settings)
      language, detected_automatically = resolve_tts_language(
        text,
        str(settings["tts"].get("language", "auto"))
      )

      print(
        f"[qwen] synth-start file={output_path.name} chars={len(text)} language={language} device={self.device}",
        flush=True
      )

      model = self._get_model()
      output_path.parent.mkdir(parents=True, exist_ok=True)

      prompt_started_at = time.perf_counter()
      print(f"[qwen] voice-prompt-start file={output_path.name}", flush=True)
      generation_kwargs: dict[str, Any] = {
        "text": text,
        "language": QWEN_LANGUAGE_MAP.get(language, "Italian"),
        "non_streaming_mode": True,
        "voice_clone_prompt": self._get_voice_clone_prompt(
          model=model,
          reference_path=reference_path,
          reference_text=reference_text
        )
      }
      print(
        f"[qwen] voice-prompt-ready file={output_path.name} elapsed={time.perf_counter() - prompt_started_at:.2f}s",
        flush=True
      )

      generation_started_at = time.perf_counter()
      print(f"[qwen] generate-start file={output_path.name}", flush=True)
      wavs, sample_rate = model.generate_voice_clone(**generation_kwargs)
      print(
        f"[qwen] generate-ready file={output_path.name} elapsed={time.perf_counter() - generation_started_at:.2f}s",
        flush=True
      )
      audio = wavs[0]

      if hasattr(audio, "detach"):
        audio = audio.detach().cpu().float().numpy()

      import soundfile as sf

      sf.write(str(output_path), audio, sample_rate)
      print(
        f"[qwen] synth-done file={output_path.name} elapsed={time.perf_counter() - synth_started_at:.2f}s sample_rate={sample_rate}",
        flush=True
      )

      warnings: list[str] = []
      if self.device == "cpu" and not self._cpu_notice_emitted:
        self._cpu_notice_emitted = True
        warnings.append(
          "Qwen beta sta girando su CPU. Il primo chunk puo richiedere alcuni minuti."
        )

      if (
        abs(float(settings["tts"].get("speakingSpeed", 1.0) or 1.0) - 1.0) > 0.01
        and not self._speed_notice_emitted
      ):
        self._speed_notice_emitted = True
        warnings.append(
          "Qwen beta al momento ignora il controllo velocita diretto e usa il ritmo nativo del modello."
        )

      if detected_automatically and language not in self._auto_language_notices:
        self._auto_language_notices.add(language)
        label = "italiano" if language == "it" else "inglese"
        warnings.append(f"Lingua rilevata automaticamente per il TTS: {label}.")

      return warnings
    except Exception as error:
      if self.allow_fallback:
        warnings = self.fallback.synthesize(text, output_path, settings)
        warnings.append(
          f"Qwen non e riuscito a sintetizzare l'audio e ho usato il placeholder: {error}"
        )
        return warnings
      raise RuntimeError(self._format_debug_error(error, settings, output_path)) from error

  def _resolve_reference_audio(self, settings: dict) -> Path | None:
    configured_reference = str(settings["tts"].get("referenceAudioPath", "")).strip()
    if not configured_reference:
      return None

    reference_path = Path(configured_reference).expanduser().resolve()
    if not reference_path.exists():
      return None

    return reference_path

  def _resolve_reference_text(self, settings: dict) -> str:
    configured_text = str(settings["tts"].get("referenceText", "")).strip()
    if configured_text:
      return configured_text

    raise RuntimeError(
      "Qwen richiede anche il testo del sample per mantenere meglio ritmo e velocita della voce di riferimento."
    )

  def _get_model(self) -> Any:
    if self._model is not None:
      return self._model

    import torch
    from qwen_tts import Qwen3TTSModel
    self._patch_qwen_local_audio_loader(Qwen3TTSModel)

    model_started_at = time.perf_counter()
    print(f"[qwen] model-load-start model={self.model_name} device={self.device}", flush=True)
    dtype = self._resolve_dtype(torch)
    load_kwargs: dict[str, Any] = {
      "device_map": self.device if self.device in {"cpu", "cuda", "auto"} else "cpu"
    }

    if dtype is not None:
      load_kwargs["dtype"] = dtype

    if load_kwargs["device_map"] == "cuda":
      load_kwargs["attn_implementation"] = "flash_attention_2"

    self._model = Qwen3TTSModel.from_pretrained(self.model_name, **load_kwargs)
    if not self._model_ready_logged:
      self._model_ready_logged = True
      print(
        f"[qwen] model-load-ready elapsed={time.perf_counter() - model_started_at:.2f}s",
        flush=True
      )
    return self._model

  def _get_voice_clone_prompt(
    self,
    model: Any,
    reference_path: Path,
    reference_text: str
  ) -> Any:
    cache_key = (str(reference_path), reference_text)
    cached = self._voice_prompt_cache.get(cache_key)
    if cached is not None:
      return cached

    prompt_kwargs: dict[str, Any] = {
      "ref_audio": self._load_reference_audio(reference_path),
      "x_vector_only_mode": False
    }
    if reference_text:
      prompt_kwargs["ref_text"] = reference_text

    prompt = model.create_voice_clone_prompt(**prompt_kwargs)
    self._voice_prompt_cache[cache_key] = prompt
    return prompt

  def _resolve_dtype(self, torch_module: Any) -> Any:
    configured = os.getenv("GRILLO_QWEN_DTYPE", "").strip().lower()
    if configured == "bfloat16":
      return torch_module.bfloat16

    if configured == "float16":
      return torch_module.float16

    return torch_module.float32

  def _load_reference_audio(self, reference_path: Path) -> tuple[Any, int]:
    import numpy as np
    import soundfile as sf

    audio, sample_rate = sf.read(str(reference_path), dtype="float32", always_2d=False)
    if getattr(audio, "ndim", 1) > 1:
      audio = np.mean(audio, axis=-1)
    return np.asarray(audio, dtype=np.float32), int(sample_rate)

  def _patch_qwen_local_audio_loader(self, model_class: Any) -> None:
    if getattr(model_class, "_grillo_local_audio_loader_patched", False):
      return

    original_loader = model_class._load_audio_to_np

    def patched_loader(instance, source):
      if isinstance(source, str) and not instance._is_url(source) and not instance._is_probably_base64(source):
        import numpy as np
        import soundfile as sf

        audio, sample_rate = sf.read(source, dtype="float32", always_2d=False)
        if getattr(audio, "ndim", 1) > 1:
          audio = np.mean(audio, axis=-1)
        return np.asarray(audio, dtype=np.float32), int(sample_rate)

      return original_loader(instance, source)

    model_class._load_audio_to_np = patched_loader
    model_class._grillo_local_audio_loader_patched = True

  def _format_debug_error(self, error: Exception, settings: dict, output_path: Path) -> str:
    reference_audio = str(settings["tts"].get("referenceAudioPath", "")).strip()
    reference_text = str(settings["tts"].get("referenceText", "")).strip()
    debug_lines = [
      f"{type(error).__name__}: {error}",
      f"model={self.model_name}",
      f"device={self.device}",
      f"effective_reference_audio={reference_audio or '<missing>'}",
      f"effective_reference_text={'yes' if reference_text else 'no'}",
      f"output_path={output_path}",
      "traceback:",
      traceback.format_exc().strip()
    ]
    return "\n".join(debug_lines)
