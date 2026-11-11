"""Sintesi vocale con OmniVoice (k2-fsa), clonando una delle voci in backend/voices."""

from __future__ import annotations

import os
import time
from typing import Any, Callable

import numpy as np

from app.voices import Voice

MODEL_ID = os.getenv("GRILLO_OMNIVOICE_MODEL", "k2-fsa/OmniVoice")
SAMPLE_RATE = 24000


def resolve_device() -> str:
  forced = os.getenv("GRILLO_DEVICE", "").strip().lower()
  if forced:
    return forced

  import torch

  if torch.cuda.is_available():
    return "cuda"
  if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
    return "mps"
  return "cpu"


def resolve_dtype(device: str) -> Any:
  import torch

  forced = os.getenv("GRILLO_DTYPE", "").strip().lower()
  if forced == "float16":
    return torch.float16
  if forced == "bfloat16":
    return torch.bfloat16
  if forced == "float32":
    return torch.float32
  # float16 e sicuro su CUDA; su MPS e CPU restiamo su float32 finche non e misurato.
  return torch.float16 if device == "cuda" else torch.float32


def prefetch_model(log: Callable[[str], None] = print) -> str:
  """Scarica i pesi (circa 2,5 GB) senza caricarli in memoria."""
  from huggingface_hub import snapshot_download

  log(f"Download del modello {MODEL_ID} (solo la prima volta, circa 2,5 GB)")
  return snapshot_download(MODEL_ID)


class OmniVoiceEngine:
  def __init__(self, voice: Voice, speed: float = 1.0, log: Callable[[str], None] = print) -> None:
    self.voice = voice
    self.speed = max(0.7, min(1.4, float(speed)))
    self.log = log
    self.device = resolve_device()
    self._model: Any = None
    self._prompt: Any = None
    # True se al caricamento la voce (creata da un campione vecchio) è stata riparata.
    self.repaired = False

  def load(self) -> None:
    if self._model is not None:
      return

    from omnivoice import OmniVoice

    started = time.perf_counter()
    self.log(f"Caricamento OmniVoice su {self.device}")
    self._model = OmniVoice.from_pretrained(
      MODEL_ID,
      device_map=self.device,
      dtype=resolve_dtype(self.device),
    )
    transcript = self.voice.transcript
    if self.voice.custom:
      from app.voice_create import repair_voice_sample

      try:
        fixed = repair_voice_sample(self._model, self.voice.id, self.voice.sample_path, transcript, log=self.log)
      except Exception as error:  # la riparazione non deve fermare la conversione
        self.log(f"Controllo della voce non riuscito: {error}")
        fixed = None
      if fixed:
        transcript = fixed
        self.repaired = True
    self._prompt = self._model.create_voice_clone_prompt(
      ref_audio=str(self.voice.sample_path),
      ref_text=transcript,
    )
    self.log(f"OmniVoice pronto in {time.perf_counter() - started:.1f}s (voce {self.voice.name})")

  def synthesize(self, text: str) -> np.ndarray:
    self.load()
    audio = self._model.generate(
      text=text,
      language="it",
      voice_clone_prompt=self._prompt,
      speed=self.speed,
    )[0]
    return np.asarray(audio, dtype=np.float32).squeeze()
