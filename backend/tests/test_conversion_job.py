"""La conversione di un capitolo dall'inizio alla fine, con una voce finta al posto di OmniVoice."""

import json

import numpy as np
import pytest

from app.audio.measure import speech_profile
from app.jobs import conversion_job
from app.jobs.conversion_job import SETTINGS_FILE, ConversionJob
from app.tts.settings import CLASSICO, NATURALE, settings_for
from app.utils.events import EventEmitter
from app.voices import get_voice

RATE = 24000
SENTENCE = "Il treno arrivò in ritardo, come sempre, e nessuno se ne stupì più di tanto quella sera."
TEXT = "\n\n".join([" ".join([SENTENCE] * 5), " ".join([SENTENCE] * 2), "***", " ".join([SENTENCE] * 2)])


class FakeEngine:
  """Al posto della voce: un tono lungo quanto il testo, con un po' di silenzio ai bordi come OmniVoice."""

  made: list[str] = []

  def __init__(self, voice, speed=1.0, log=print, settings=None, model=None):
    self.voice, self.speed, self.repaired = voice, speed, False
    self.settings = settings or settings_for(voice)

  def load(self):
    pass

  def synthesize(self, text):
    FakeEngine.made.append(text)
    t = np.arange(int(len(text) / 15 * RATE)) / RATE
    quiet = np.zeros(int(0.2 * RATE), dtype=np.float32)
    return np.concatenate([quiet, (0.2 * np.sin(2 * np.pi * 200 * t)).astype(np.float32), quiet])


@pytest.fixture
def library(tmp_path, monkeypatch):
  monkeypatch.delenv("GRILLO_PROFILO", raising=False)
  monkeypatch.delenv("GRILLO_NUM_STEP", raising=False)
  monkeypatch.delenv("GRILLO_GUIDANCE", raising=False)
  monkeypatch.setattr(conversion_job, "OmniVoiceEngine", FakeEngine)

  def fake_mp3(audio, rate, file):
    file.parent.mkdir(parents=True, exist_ok=True)
    np.save(str(file) + ".npy", audio)
    file.write_bytes(b"mp3")
    return len(audio) / rate

  monkeypatch.setattr(conversion_job, "write_mp3", fake_mp3)
  FakeEngine.made = []
  folder = tmp_path / "books" / "libro"
  (folder / "text").mkdir(parents=True)
  (folder / "text" / "001.txt").write_text(TEXT, encoding="utf-8")
  book = {
    "id": "libro", "title": "Libro", "kind": "libro", "speed": 1.0, "readTitles": True,
    "voice": {"id": "stella", "name": "Stella"},
    "chapters": [{"index": 1, "title": "Capitolo III", "status": "pending", "chars": len(TEXT)}],
  }
  (folder / "book.json").write_text(json.dumps(book), encoding="utf-8")
  return tmp_path


class Quiet(EventEmitter):
  def emit(self, event_type, payload):
    pass


def run(library):
  job = ConversionJob("libro", [1], str(library), Quiet(), lambda: False)
  job.run()
  return job


def test_capitolo_con_pause_diverse(library):
  job = run(library)
  # Titolo letto come si dice, poi pezzi a fine frase; il cambio di scena non viene letto.
  assert FakeEngine.made[0] == "Capitolo terzo."
  assert all(len(text) <= NATURALE.chunk_chars * 1.2 for text in FakeEngine.made)
  assert all("*" not in text for text in FakeEngine.made)
  audio = np.load(str(job.store.chapter_file(1)) + ".npy")
  pauses = [round(end - start, 1) for start, end in speech_profile(audio, RATE).pauses]
  # titolo, pausa tra frasi dentro il primo paragrafo, fine paragrafo, cambio di scena
  assert pauses == [1.4, 0.6, 1.0, 1.9]
  # A capitolo finito i pezzi si cancellano, l'etichetta delle impostazioni resta.
  assert not list(job.store.work_dir.glob("*.wav"))
  assert (job.store.work_dir / SETTINGS_FILE).read_text(encoding="utf-8").startswith(NATURALE.label)


def test_pezzi_vecchi_rifatti_quando_cambiano_le_impostazioni(library):
  import soundfile as sf

  work = library / "books" / "libro" / "work"
  work.mkdir()
  # Pezzi lasciati a metà da una versione precedente (nessuna etichetta): non combaciano con la divisione nuova.
  for part in range(3):
    sf.write(str(work / f"001-{part:04d}.wav"), np.zeros(RATE, dtype=np.float32), RATE)
  run(library)
  audio = np.load(str(library / "books" / "libro" / "chapters" / "001.mp3") + ".npy")
  assert speech_profile(audio, RATE).speech_seconds > 10  # niente pezzi muti presi dalla cache
  assert len(FakeEngine.made) == 5


def test_pezzi_gia_pronti_riusati_con_le_stesse_impostazioni(library):
  import soundfile as sf

  work = library / "books" / "libro" / "work"
  work.mkdir()
  voice = get_voice("stella")
  (work / SETTINGS_FILE).write_text(f"{NATURALE.label} {voice.sample_path.name}:{voice.sample_path.stat().st_size} 1", encoding="utf-8")
  sf.write(str(work / "001-0000.wav"), FakeEngine(voice).synthesize("Capitolo terzo."), RATE)
  FakeEngine.made = []
  run(library)
  assert "Capitolo terzo." not in FakeEngine.made
  assert len(FakeEngine.made) == 4


def test_voce_dell_utente_come_prima(library, monkeypatch):
  from dataclasses import replace

  custom = replace(get_voice("stella"), custom=True)
  monkeypatch.setattr(conversion_job, "get_voice", lambda voice_id: custom)
  import soundfile as sf

  work = library / "books" / "libro" / "work"
  work.mkdir()
  # Con la lettura classica i pezzi senza etichetta sono ancora buoni: una conversione a metà riprende.
  sf.write(str(work / "001-0000.wav"), FakeEngine(custom).synthesize("Capitolo III."), RATE)
  FakeEngine.made = []
  run(library)
  # Titolo non riscritto e non rifatto, testo in pezzi da 600 caratteri con i paragrafi uniti, asterischi compresi.
  assert len(FakeEngine.made) == 2
  assert "\n\n***\n\n" in FakeEngine.made[1]
  audio = np.load(str(library / "books" / "libro" / "chapters" / "001.mp3") + ".npy")
  pauses = [round(end - start, 2) for start, end in speech_profile(audio, RATE).pauses]
  assert pauses == pytest.approx([1.4, 0.75], abs=0.02)  # 1,0 e 0,35 più i 0,2 s di silenzio ai bordi di ogni pezzo
  assert (work / SETTINGS_FILE).read_text(encoding="utf-8").startswith(CLASSICO.label)
