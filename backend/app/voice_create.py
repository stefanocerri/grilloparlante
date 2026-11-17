"""Crea una nuova voce da un campione audio (clonazione con OmniVoice).

Il campione viene pulito (silenzi, mono, 24 kHz) e tagliato a circa 15 secondi; se manca la trascrizione la ricava
Whisper (scaricato la prima volta, circa 1,6 GB). Poi salva <id>.wav, <id>.txt e un'anteprima <id>.preview.mp3 nella
cartella delle voci dell'utente e aggiunge la voce a voices.json.
"""

from __future__ import annotations

import json
import secrets
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from app.audio.mp3 import write_mp3
from app.utils.events import EventEmitter
from app.utils.files import slugify

SAMPLE_RATE = 24000
MIN_SECONDS = 4.0
TARGET_SECONDS = 15.0
MAX_WITH_TRANSCRIPT = 30.0
PAUSE_SECONDS = 0.25
# Revisione del campione: le voci create prima del taglio in una pausa vera (revisione 2) vengono riparate al primo uso.
SAMPLE_REVISION = 2
PREVIEW_TEXT = "Ciao, sono la tua nuova voce. Da oggi posso leggerti libri, articoli e notizie, capitolo per capitolo."


class VoiceError(Exception):
  """Errore da mostrare all'utente così com'è."""


def _last_pause(audio: np.ndarray, seconds: float) -> int | None:
  """Centro dell'ultima pausa vera (almeno PAUSE_SECONDS di silenzio) prima di `seconds` e dopo MIN_SECONDS."""
  end = int(seconds * SAMPLE_RATE)
  hop = int(0.01 * SAMPLE_RATE)
  span = int(PAUSE_SECONDS / 0.01)
  if len(audio) < 2 * hop:
    return None
  energy = np.array([float(np.mean(audio[i:i + hop] ** 2)) for i in range(0, len(audio) - hop, hop)])
  quiet = energy < max(float(np.percentile(energy, 90)) * 0.01, 1e-7)
  # pause lunghe almeno `span` passi, cercate all'indietro da `seconds` fino a `MIN_SECONDS`
  last = min(len(quiet), end // hop)
  first = int(MIN_SECONDS * SAMPLE_RATE) // hop
  run = 0
  for index in range(last - 1, first - 1, -1):
    run = run + 1 if quiet[index] else 0
    if run >= span:
      return (index + run // 2) * hop
  return None


def _cut_at_pause(audio: np.ndarray, seconds: float) -> np.ndarray:
  """Taglia vicino a `seconds` in una pausa vera (almeno un quarto di secondo di silenzio), mai dentro una parola.

  Se il campione finisce con un pezzo di parola, Whisper lo scarta dalla trascrizione e OmniVoice lo ripete
  all'inizio di ogni audio (era il «un» in più).
  """
  if len(audio) <= int(seconds * SAMPLE_RATE):
    return audio
  cut = _last_pause(audio, seconds)
  if cut is not None:
    return audio[:cut]
  raise VoiceError(
    "Nel campione non trovo una pausa per tagliarlo senza spezzare una parola. Usa un audio con qualche pausa tra "
    "le frasi, oppure scrivi tu la trascrizione esatta."
  )


def _converters(source: str, target: str) -> list[list[str]]:
  """Comandi di sistema che sanno convertire in WAV mono 24 kHz: afconvert (di serie su macOS) e ffmpeg."""
  commands = []
  afconvert = shutil.which("afconvert") or "/usr/bin/afconvert"
  if Path(afconvert).exists():
    commands.append([afconvert, "-f", "WAVE", "-d", f"LEI16@{SAMPLE_RATE}", "-c", "1", source, target])
  candidates = [shutil.which("ffmpeg"), "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"]
  ffmpeg = next((item for item in candidates if item and Path(item).exists()), None)
  if ffmpeg:
    commands.append([ffmpeg, "-v", "error", "-y", "-i", source, "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), target])
  return commands


def _load_converted(input_path: str) -> np.ndarray | None:
  """Per i formati che le librerie Python non aprono da sole (M4A/AAC, video…): converte e rilegge."""
  import soundfile as sf

  with tempfile.TemporaryDirectory() as folder:
    target = str(Path(folder) / "campione.wav")
    for command in _converters(input_path, target):
      try:
        subprocess.run(command, check=True, capture_output=True, timeout=120)
        audio, _ = sf.read(target, dtype="float32", always_2d=True)
      except (OSError, RuntimeError, subprocess.SubprocessError):
        continue
      if len(audio):
        return audio.mean(axis=1)
  return None


def _load_sample(input_path: str) -> np.ndarray:
  from omnivoice.utils.audio import load_audio

  try:
    audio = np.asarray(load_audio(input_path, SAMPLE_RATE)[0], dtype=np.float32).squeeze()
    if audio.size:
      return audio
  except Exception:  # formato che le librerie non aprono: provo a convertirlo
    pass
  audio = _load_converted(input_path)
  if audio is None:
    raise VoiceError("Non riesco a leggere questo file audio. Prova a convertirlo in WAV o MP3.")
  return audio


def prepare_sample(input_path: str, has_transcript: bool) -> np.ndarray:
  import librosa

  audio = _load_sample(input_path)
  audio, _ = librosa.effects.trim(audio, top_db=35)
  seconds = len(audio) / SAMPLE_RATE
  if seconds < MIN_SECONDS:
    raise VoiceError("Il campione è troppo corto: servono almeno 5 secondi di parlato, meglio 10–15.")
  if has_transcript:
    if seconds > MAX_WITH_TRANSCRIPT:
      raise VoiceError(
        "Con la trascrizione il campione deve durare al massimo 30 secondi. Accorcialo, oppure lascia vuota la "
        "trascrizione: la ricavo io dai primi 15 secondi."
      )
  else:
    audio = _cut_at_pause(audio, TARGET_SECONDS)
  peak = float(np.max(np.abs(audio))) or 1.0
  return (audio / peak * 0.9).astype(np.float32)


def _read_index(voices_dir: Path) -> list[dict]:
  try:
    return json.loads((voices_dir / "voices.json").read_text(encoding="utf-8"))
  except (OSError, ValueError):
    return []


def _write_index(voices_dir: Path, entries: list[dict]) -> None:
  partial = voices_dir / "voices.json.part"
  partial.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
  partial.replace(voices_dir / "voices.json")


def create_voice(
  input_path: str,
  name: str,
  gender: str,
  transcript: str | None,
  voices_dir: str,
  emitter: EventEmitter,
  is_cancelled=lambda: False,
) -> dict:
  import soundfile as sf

  from app.tts.omnivoice_engine import MODEL_ID, resolve_device, resolve_dtype

  name = name.strip() or "Nuova voce"
  transcript = (transcript or "").strip() or None
  target = Path(voices_dir)
  target.mkdir(parents=True, exist_ok=True)
  voice_id = f"mia_{slugify(name, 24) or 'voce'}_{secrets.token_hex(3)}"

  def step(progress: float, label: str) -> None:
    if is_cancelled():
      raise KeyboardInterrupt
    emitter.emit("progress", {"progress": progress, "label": label})

  step(0.05, "Preparo il campione…")
  audio = prepare_sample(input_path, has_transcript=bool(transcript))

  step(0.15, "Carico il narratore…")
  from omnivoice import OmniVoice

  device = resolve_device()
  model = OmniVoice.from_pretrained(MODEL_ID, device_map=device, dtype=resolve_dtype(device))

  if not transcript:
    step(0.35, "Ascolto il campione per trascriverlo (la prima volta scarica Whisper, circa 1,6 GB)…")
    model.load_asr_model()
    transcript = model.transcribe((audio[np.newaxis, :], SAMPLE_RATE)).strip()
    if len(transcript) < 10:
      raise VoiceError("Nel campione non sento abbastanza parlato. Usa un audio con una sola persona che parla chiaramente.")

  sample_path = target / f"{voice_id}.wav"
  sf.write(str(sample_path), audio, SAMPLE_RATE, subtype="PCM_16")
  (target / f"{voice_id}.txt").write_text(transcript, encoding="utf-8")

  try:
    step(0.6, "Creo la voce…")
    prompt = model.create_voice_clone_prompt(ref_audio=str(sample_path), ref_text=transcript)
    step(0.75, "Registro un'anteprima…")
    preview = model.generate(text=PREVIEW_TEXT, language="it", voice_clone_prompt=prompt)[0]
    write_mp3(np.asarray(preview, dtype=np.float32).squeeze(), SAMPLE_RATE, target / f"{voice_id}.preview.mp3")
  except BaseException:
    for suffix in (".wav", ".txt", ".preview.mp3"):
      (target / f"{voice_id}{suffix}").unlink(missing_ok=True)
    raise

  entry = {
    "id": voice_id,
    "name": name,
    "gender": gender if gender in ("uomo", "donna") else "altro",
    "description": "Creata da un campione",
    "custom": True,
    "sampleRevision": SAMPLE_REVISION,
  }
  entries = [item for item in _read_index(target) if item.get("id") != voice_id]
  _write_index(target, entries + [entry])
  step(1.0, "Voce pronta")
  emitter.emit("result", {**entry, "transcript": transcript})
  return entry


def delete_voice(voice_id: str, voices_dir: str) -> None:
  target = Path(voices_dir)
  entries = _read_index(target)
  if not any(item.get("id") == voice_id for item in entries):
    raise VoiceError("Questa voce non è tra quelle create da te.")
  _write_index(target, [item for item in entries if item.get("id") != voice_id])
  for suffix in (".wav", ".txt", ".preview.mp3", ".orig.wav", ".orig.txt"):
    (target / f"{voice_id}{suffix}").unlink(missing_ok=True)


def repair_voice_sample(model, voice_id: str, sample_path: Path, transcript: str, log=print) -> str | None:
  """Ripara una voce creata prima della revisione 2 del campione; restituisce la nuova trascrizione.

  Le voci vecchie avevano il campione tagliato a 15 secondi esatti, spesso dentro una parola: quel pezzo non
  finiva (o finiva male) nella trascrizione e OmniVoice lo ripeteva all'inizio di ogni audio («ancora un»).
  Qui il campione si accorcia all'ultima pausa vera e si ritrascrive con Whisper, così audio e testo coincidono.
  Gli originali restano accanto come <id>.orig.wav / <id>.orig.txt. Se non serve o non si può, restituisce None
  e segna comunque la voce come controllata, per non riprovarci a ogni conversione.
  """
  import soundfile as sf

  folder = sample_path.parent
  entries = _read_index(folder)
  entry = next((item for item in entries if item.get("id") == voice_id), None)
  if entry is None or int(entry.get("sampleRevision", 1)) >= SAMPLE_REVISION:
    return None

  def mark(**extra) -> None:
    entry.update({"sampleRevision": SAMPLE_REVISION, **extra})
    _write_index(folder, entries)

  try:
    audio, rate = sf.read(str(sample_path), dtype="float32", always_2d=True)
    audio = audio.mean(axis=1)
  except (OSError, RuntimeError):
    mark()
    return None
  if rate != SAMPLE_RATE:
    mark()
    return None

  # Si taglia all'ultima pausa prima della fine: il pezzo dopo è quello che la voce ripeteva.
  cut = _last_pause(audio, len(audio) / SAMPLE_RATE)
  if cut is None or len(audio) - cut < int(0.05 * SAMPLE_RATE):
    mark()
    return None
  fixed = audio[:cut]
  trailing = int(0.15 * SAMPLE_RATE)
  # niente silenzio lungo in coda: basta un attimo dopo l'ultima parola
  import librosa

  fixed, _ = librosa.effects.trim(fixed, top_db=35)
  fixed = np.concatenate([fixed, np.zeros(trailing, dtype=np.float32)])

  log(f"Riparo la voce {entry.get('name', voice_id)}: campione da {len(audio) / SAMPLE_RATE:.1f}s a {len(fixed) / SAMPLE_RATE:.1f}s")
  model.load_asr_model()
  new_transcript = model.transcribe((fixed[np.newaxis, :], SAMPLE_RATE)).strip()
  if len(new_transcript) < 10:
    mark()
    return None

  original_wav = folder / f"{voice_id}.orig.wav"
  original_txt = folder / f"{voice_id}.orig.txt"
  if not original_wav.exists():
    shutil.copyfile(sample_path, original_wav)
    original_txt.write_text(transcript, encoding="utf-8")
  sf.write(str(sample_path), fixed, SAMPLE_RATE, subtype="PCM_16")
  (folder / f"{voice_id}.txt").write_text(new_transcript, encoding="utf-8")

  try:
    prompt = model.create_voice_clone_prompt(ref_audio=str(sample_path), ref_text=new_transcript)
    preview = model.generate(text=PREVIEW_TEXT, language="it", voice_clone_prompt=prompt)[0]
    write_mp3(np.asarray(preview, dtype=np.float32).squeeze(), SAMPLE_RATE, folder / f"{voice_id}.preview.mp3")
  except Exception as error:  # l'anteprima è un di più: la voce è già riparata
    log(f"Anteprima non rifatta: {error}")
  mark(repairedFrom=f"{voice_id}.orig.wav")
  log(f"Voce riparata. Prima: «…{transcript[-40:]}» Ora: «…{new_transcript[-40:]}»")
  return new_transcript
