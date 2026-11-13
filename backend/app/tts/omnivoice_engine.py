"""Sintesi vocale con OmniVoice (k2-fsa), clonando una delle voci in backend/voices."""

from __future__ import annotations

import os
import re
import time
from typing import Any, Callable

import numpy as np

from app.tts.pacing import EDGE_SECONDS, VoicePace, estimate_seconds, voice_pace
from app.tts.settings import NarrationSettings, settings_for
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


# Controllo dei pezzi: fuori da questi limiti il pezzo si rigenera una volta.
DURATION_RATIO_RANGE = (0.6, 1.8)   # durata ottenuta / durata attesa
MAX_INNER_PAUSE = 0.95              # un silenzio così lungo dentro un pezzo è un buco, non una pausa
MAX_CLIPPED = 0.001                 # quota di campioni a fondo scala


def piece_problems(audio: np.ndarray, expected_seconds: float | None) -> list[str]:
  """Difetti che si riconoscono senza ascoltare: durata fuori scala, buchi di silenzio, audio che gracchia."""
  from app.audio.measure import clipped_fraction, speech_profile

  profile = speech_profile(audio, SAMPLE_RATE)
  spoken = profile.seconds - profile.lead - profile.trail
  if spoken <= 0.05:
    return ["nessuna voce"]
  problems: list[str] = []
  if expected_seconds:
    ratio = spoken / expected_seconds
    if not DURATION_RATIO_RANGE[0] <= ratio <= DURATION_RATIO_RANGE[1]:
      problems.append(f"durata {spoken:.1f}s invece di {expected_seconds:.1f}s")
  if profile.longest_pause > MAX_INNER_PAUSE:
    problems.append(f"silenzio di {profile.longest_pause:.1f}s")
  if clipped_fraction(audio) > MAX_CLIPPED:
    problems.append("volume a fondo scala")
  return problems


class OmniVoiceEngine:
  def __init__(
    self,
    voice: Voice,
    speed: float = 1.0,
    log: Callable[[str], None] = print,
    settings: NarrationSettings | None = None,
    model: Any = None,
  ) -> None:
    self.voice = voice
    self.speed = max(0.7, min(1.4, float(speed)))
    self.log = log
    self.settings = settings or settings_for(voice)
    self.device = resolve_device()
    # Un modello già caricato si può passare da fuori (lo script di confronto ne usa uno per tutte le voci).
    self._model: Any = model
    self._prompt: Any = None
    self._pace: VoicePace | None = None
    # True se al caricamento la voce (creata da un campione vecchio) è stata riparata.
    self.repaired = False
    # Pezzi rigenerati perché venuti male.
    self.retried = 0

  def load(self) -> None:
    if self._prompt is not None:
      return

    started = time.perf_counter()
    if self._model is None:
      from omnivoice import OmniVoice

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
    # Senza preprocess OmniVoice non accorcia le pause del campione (ne sbaglierebbe la velocità) e non aggiunge
    # il punto in fondo al testo di riferimento: lo mettiamo noi se manca.
    if not self.settings.preprocess_prompt and transcript.rstrip()[-1:] not in ".!?…»”\"":
      transcript = transcript.rstrip() + "."
    self._prompt = self._model.create_voice_clone_prompt(
      ref_audio=str(self.voice.sample_path),
      ref_text=transcript,
      preprocess_prompt=self.settings.preprocess_prompt,
    )
    if self.settings.own_duration:
      self._pace = self._measure_pace(transcript)
    self.log(f"OmniVoice pronto in {time.perf_counter() - started:.1f}s (voce {self.voice.name})")

  def _measure_pace(self, transcript: str) -> VoicePace:
    import soundfile as sf

    try:
      audio, rate = sf.read(str(self.voice.sample_path), dtype="float32", always_2d=True)
      return voice_pace(audio.mean(axis=1), rate, transcript)
    except (OSError, RuntimeError) as error:
      self.log(f"Velocità del campione non misurata ({error}): uso quella media")
      return VoicePace()

  def expected_seconds(self, text: str) -> float | None:
    """Durata che chiederemo a OmniVoice per questo testo (None se la stima la fa lui)."""
    if not self.settings.own_duration or self._pace is None:
      return None
    return estimate_seconds(text, self._pace, self.speed) * self.settings.duration_stretch

  def _generate(self, text: str, expected: float | None) -> np.ndarray:
    options = self.settings.generation_kwargs()
    if expected is not None:
      # La velocità scelta per il libro è già dentro la durata.
      options["duration"] = expected
      # La durata l'abbiamo scelta noi: OmniVoice non deve ridividere il pezzo per conto suo.
      options["audio_chunk_threshold"] = max(30.0, expected + 1.0)
    else:
      options["speed"] = self.speed
    audio = self._model.generate(text=text, language="it", voice_clone_prompt=self._prompt, **options)[0]
    return np.asarray(audio, dtype=np.float32).squeeze()

  def synthesize(self, text: str) -> np.ndarray:
    self.load()
    if self.settings.sentence_chunks:
      # OmniVoice cancella gli a capo senza lasciare uno spazio («fine.Inizio»): li togliamo noi.
      text = re.sub(r"\s*\n+\s*", " ", text).strip()
    expected = self.expected_seconds(text)
    audio = self._generate(text, expected)
    if not self.settings.check_quality:
      return audio
    spoken = max(expected - EDGE_SECONDS, 0.2) if expected else None
    problems = piece_problems(audio, spoken)
    if not problems:
      return audio
    # La generazione ha una parte casuale: rifatta, di solito viene bene. Si tiene la migliore delle due.
    self.retried += 1
    again = self._generate(text, expected)
    again_problems = piece_problems(again, spoken)
    self.log(f"Pezzo rifatto ({', '.join(problems)}): {'ora va bene' if not again_problems else 'tengo il migliore'}")
    return again if len(again_problems) < len(problems) else audio
