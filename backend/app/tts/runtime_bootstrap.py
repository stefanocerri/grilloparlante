from __future__ import annotations

import importlib
import os
import tempfile
import warnings
from pathlib import Path

_LIBROSA_PATCHED = False
_TRANSFORMERS_PATCHED = False
_NUMBA_CACHING_PATCHED = False


def _ensure_matplotlib_config(runtime_root: Path | None = None) -> None:
  if os.getenv("MPLCONFIGDIR"):
    return

  candidates = []
  if runtime_root:
    candidates.append(runtime_root / "logs" / "matplotlib")
  candidates.append(Path(tempfile.gettempdir()) / "grillo-parlante-matplotlib")

  for target in candidates:
    try:
      target.mkdir(parents=True, exist_ok=True)
      os.environ["MPLCONFIGDIR"] = str(target)
      return
    except OSError:
      continue


def _ensure_numba_cache(runtime_root: Path | None = None) -> None:
  if os.getenv("NUMBA_CACHE_DIR"):
    return

  candidates = []
  if runtime_root:
    candidates.append(runtime_root / "logs" / "numba-cache")
  candidates.append(Path(tempfile.gettempdir()) / "grillo-parlante-numba-cache")

  for target in candidates:
    try:
      target.mkdir(parents=True, exist_ok=True)
      os.environ["NUMBA_CACHE_DIR"] = str(target)
      return
    except OSError:
      continue


def _disable_numba_enable_caching() -> None:
  global _NUMBA_CACHING_PATCHED

  if _NUMBA_CACHING_PATCHED:
    return

  try:
    from numba.core import dispatcher as numba_dispatcher
  except Exception:
    return

  def noop_enable_caching(self) -> None:
    return None

  numba_dispatcher.Dispatcher.enable_caching = noop_enable_caching
  _NUMBA_CACHING_PATCHED = True


def _patch_librosa_exports() -> None:
  global _LIBROSA_PATCHED

  if _LIBROSA_PATCHED:
    return

  try:
    import librosa
    import numpy as np
    import soundfile as sf
  except Exception:
    return

  def safe_resample(y, orig_sr: int, target_sr: int):
    audio = np.asarray(y, dtype=np.float32)
    if int(orig_sr) == int(target_sr):
      return audio.astype(np.float32)
    if audio.ndim > 1:
      audio = np.mean(audio, axis=-1)
    source_len = int(audio.shape[0])
    if source_len == 0:
      return audio.astype(np.float32)
    target_len = max(1, int(round(source_len * float(target_sr) / float(orig_sr))))
    if target_len == source_len:
      return audio.astype(np.float32)
    source_positions = np.linspace(0.0, 1.0, num=source_len, endpoint=False, dtype=np.float32)
    target_positions = np.linspace(0.0, 1.0, num=target_len, endpoint=False, dtype=np.float32)
    return np.interp(target_positions, source_positions, audio).astype(np.float32)

  def safe_load(path_like, sr=None, mono=True):
    audio, sample_rate = sf.read(path_like, dtype="float32", always_2d=False)
    if getattr(audio, "ndim", 1) > 1 and mono:
      audio = np.mean(audio, axis=-1)
    audio = np.asarray(audio, dtype=np.float32)
    if sr is not None and int(sr) != int(sample_rate):
      audio = safe_resample(audio, int(sample_rate), int(sr))
      sample_rate = int(sr)
    return audio, int(sample_rate)

  setattr(librosa, "resample", safe_resample)
  setattr(librosa, "load", safe_load)

  def patch_attribute(attribute: str, module_candidates: tuple[str, ...]) -> None:
    try:
      value = getattr(librosa, attribute)
      if value is not None:
        return
    except Exception:
      pass

    for module_name in module_candidates:
      try:
        module = importlib.import_module(module_name)
        value = getattr(module, attribute, None)
      except Exception:
        continue

      if value is not None:
        setattr(librosa, attribute, value)
        return

  if os.getenv("GRILLO_ENABLE_LEGACY_TTS_COMPAT_PATCHES", "0") == "1":
    patch_attribute("magphase", ("librosa.core.spectrum",))
    patch_attribute("pyin", ("librosa.core.pitch", "librosa.core.spectrum"))
  _LIBROSA_PATCHED = True


def _patch_transformers_exports() -> None:
  global _TRANSFORMERS_PATCHED

  if _TRANSFORMERS_PATCHED:
    return

  try:
    import transformers
    from transformers.generation.beam_search import BeamSearchScorer, ConstrainedBeamSearchScorer
  except Exception:
    return

  if not hasattr(transformers, "BeamSearchScorer"):
    setattr(transformers, "BeamSearchScorer", BeamSearchScorer)

  if not hasattr(transformers, "ConstrainedBeamSearchScorer"):
    setattr(transformers, "ConstrainedBeamSearchScorer", ConstrainedBeamSearchScorer)

  _TRANSFORMERS_PATCHED = True


def prepare_third_party_runtime(runtime_root: Path | None = None) -> None:
  os.environ.setdefault("COQUI_TOS_AGREED", "1")
  warnings.filterwarnings("ignore", message="pkg_resources is deprecated as an API")
  _ensure_matplotlib_config(runtime_root)
  _ensure_numba_cache(runtime_root)
  _disable_numba_enable_caching()
  _patch_librosa_exports()
  if os.getenv("GRILLO_ENABLE_LEGACY_TTS_COMPAT_PATCHES", "0") == "1":
    _patch_transformers_exports()
