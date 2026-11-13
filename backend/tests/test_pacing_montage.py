import numpy as np
import pytest

from app.audio.measure import speech_profile, speech_rms
from app.audio.montage import EDGE_MARGIN, join_pieces, level, pause_after
from app.tts.omnivoice_engine import piece_problems
from app.tts.pacing import VoicePace, estimate_seconds, pause_seconds, spoken_seconds, voice_pace
from app.tts.settings import CLASSICO, NATURALE, settings_for
from app.voices import list_voices

RATE = 24000


def tone(seconds: float, amplitude: float = 0.3) -> np.ndarray:
  t = np.arange(int(seconds * RATE)) / RATE
  return (amplitude * np.sin(2 * np.pi * 220 * t)).astype(np.float32)


def quiet(seconds: float) -> np.ndarray:
  return np.zeros(int(seconds * RATE), dtype=np.float32)


def test_profilo_del_parlato():
  audio = np.concatenate([quiet(0.2), tone(1.0), quiet(0.5), tone(1.0), quiet(0.05), tone(0.5), quiet(0.3)])
  profile = speech_profile(audio, RATE)
  assert profile.lead == pytest.approx(0.2, abs=0.02)
  assert profile.trail == pytest.approx(0.3, abs=0.02)
  # La pausa da 0,05 s è troppo corta per contare.
  assert len(profile.pauses) == 1
  assert profile.pause_seconds == pytest.approx(0.5, abs=0.03)
  assert profile.speech_seconds == pytest.approx(2.55, abs=0.05)


def test_pause_del_testo():
  assert pause_seconds("Uno, due.") == pytest.approx(0.2)           # l'ultimo punto non conta
  assert pause_seconds("Uno. Due.") == pytest.approx(0.4)
  assert pause_seconds("«Davvero?» chiese. Poi… niente.") == pytest.approx(0.4 + 0.4 + 0.5)
  assert pause_seconds("L'albero dell'orto.") == 0.0                  # l'apostrofo non è una pausa
  assert pause_seconds("Fine.\nInizio.") == pytest.approx(0.4 + 0.3)  # a capo dentro il pezzo: paragrafo


def test_piu_punteggiatura_piu_tempo():
  pace = VoicePace(letters_per_second=13.0, pause_scale=1.0)
  plain = estimate_seconds("Il treno arrivò in ritardo come sempre quella sera d'inverno", pace)
  commas = estimate_seconds("Il treno arrivò, in ritardo, come sempre, quella sera d'inverno", pace)
  assert commas == pytest.approx(plain + 0.6)


def test_velocita_del_libro():
  pace = VoicePace(letters_per_second=13.0, pause_scale=1.0)
  text = "Il treno arrivò in ritardo, come sempre. Marta scese con la valigia in mano e si guardò intorno."
  assert spoken_seconds(text, pace, speed=1.25) == pytest.approx(spoken_seconds(text, pace) / 1.25)
  assert estimate_seconds(text, pace, speed=1.25) < estimate_seconds(text, pace)


def test_il_campione_ritrova_la_sua_durata():
  import soundfile as sf

  for voice in list_voices():
    for path, transcript in ((voice.sample_path, voice.transcript), (voice.news_sample_path, voice.news_transcript)):
      audio, rate = sf.read(str(path), dtype="float32")
      profile = speech_profile(audio, rate)
      pace = voice_pace(audio, rate, transcript)
      assert 9.0 <= pace.letters_per_second <= 18.0, path.name
      spoken = profile.seconds - profile.lead - profile.trail
      assert spoken_seconds(transcript, pace) == pytest.approx(spoken, rel=0.01), path.name


def test_campioni_inclusi_pronti_per_la_clonazione():
  import soundfile as sf

  for voice in list_voices():
    for path, transcript in ((voice.sample_path, voice.transcript), (voice.news_sample_path, voice.news_transcript)):
      info = sf.info(str(path))
      assert (info.samplerate, info.channels) == (RATE, 1), path.name
      # OmniVoice consiglia campioni brevi e avvisa oltre i 20 secondi.
      assert info.duration <= 18.5, path.name
      # Senza preprocess OmniVoice non aggiunge il punto finale: deve esserci già.
      assert transcript[-1] in ".!?…", path.name


def test_pause_secondo_il_punto_del_testo():
  assert pause_after("Fine frase.", False, False, NATURALE) == NATURALE.pause_sentence
  assert pause_after("Fine paragrafo.", True, False, NATURALE) == NATURALE.pause_paragraph
  assert pause_after("Fine scena.", True, True, NATURALE) == NATURALE.pause_scene
  assert pause_after("a metà frase,", False, False, NATURALE) < NATURALE.pause_sentence
  assert NATURALE.pause_sentence < NATURALE.pause_paragraph < NATURALE.pause_title < NATURALE.pause_scene
  # Lettura classica: sempre 0,35 s.
  assert {pause_after("x.", a, b, CLASSICO) for a in (True, False) for b in (True, False)} == {0.35}


def test_montaggio_con_pause_precise():
  # Due pezzi con silenzi diversi ai bordi: la pausa montata è comunque quella chiesta.
  first = np.concatenate([quiet(0.3), tone(1.0), quiet(0.25)])
  second = np.concatenate([quiet(0.1), tone(1.0), quiet(0.4)])
  audio = join_pieces([(first, 1.0), (second, 0.6)], NATURALE, RATE)
  profile = speech_profile(audio, RATE)
  assert len(profile.pauses) == 1
  assert profile.longest_pause == pytest.approx(1.0, abs=0.04)
  assert np.max(np.abs(audio[:10])) == 0.0


def test_montaggio_classico_invariato():
  first, second = tone(1.0), tone(0.5)
  audio = join_pieces([(first, 1.0), (second, 0.35)], CLASSICO, RATE)
  expected = np.concatenate([first, quiet(1.0), second, quiet(0.35)])
  assert np.array_equal(audio, expected)


def test_volume_uniforme():
  loud, soft = tone(1.0, 0.3), tone(1.0, 0.05)
  assert speech_rms(level(loud, RATE, 0.1), RATE) == pytest.approx(0.1, rel=0.05)
  assert speech_rms(level(soft, RATE, 0.1), RATE) == pytest.approx(0.1, rel=0.05)
  assert np.max(np.abs(level(tone(1.0, 0.001), RATE, 0.1))) <= 0.97


def test_pezzi_venuti_male():
  good = np.concatenate([quiet(0.1), tone(2.0), quiet(0.3), tone(2.0), quiet(0.1)])
  assert piece_problems(good, 4.3) == []
  assert piece_problems(good, 9.0) != []                                 # molto più corto del previsto
  hole = np.concatenate([tone(2.0), quiet(1.5), tone(2.0)])
  assert any("silenzio" in problem for problem in piece_problems(hole, 5.5))
  assert piece_problems(np.clip(tone(2.0, 3.0), -1, 1), 2.0) != []       # a fondo scala
  assert piece_problems(quiet(2.0), 2.0) == ["nessuna voce"]


def test_profilo_per_tipo_di_voce(monkeypatch):
  from dataclasses import replace

  monkeypatch.delenv("GRILLO_PROFILO", raising=False)
  monkeypatch.delenv("GRILLO_NUM_STEP", raising=False)
  bundled = list_voices()[0]
  custom = replace(bundled, custom=True)
  assert settings_for(bundled) == NATURALE
  # Le voci create dall'utente restano esattamente come prima.
  assert settings_for(custom) == CLASSICO
  assert (CLASSICO.chunk_chars, CLASSICO.num_step, CLASSICO.preprocess_prompt, CLASSICO.own_duration) == (600, 32, True, False)
  monkeypatch.setenv("GRILLO_NUM_STEP", "24")
  assert settings_for(bundled).num_step == 24
  assert settings_for(bundled).label != NATURALE.label
