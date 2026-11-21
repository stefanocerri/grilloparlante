"""Lingua del libro e traduzione dei capitoli, con un traduttore finto al posto di TranslateGemma."""

import json

import numpy as np
import pytest

from app.jobs import conversion_job
from app.jobs.conversion_job import ConversionJob, settings_for_language, spoken_language
from app.language import detect_language, normalize_language
from app.library import BookStore
from app.text_cleanup import clean_for_speech
from app.translation import job as translation_job
from app.translation.job import set_translation, translate_chapters
from app.translation.translator import Translator, build_prompt, choose_model, looks_broken, split_pieces
from app.tts.settings import NATURALE
from app.utils.events import EventEmitter

ENGLISH = (
  "There was no possibility of taking a walk that day. We had been wandering, indeed, in the leafless shrubbery an "
  "hour in the morning; but since dinner the cold winter wind had brought with it clouds so sombre, and a rain so "
  "penetrating, that further out-door exercise was now out of the question. I was glad of it: I never liked long "
  "walks, especially on chilly afternoons."
)
ITALIAN = (
  "Il treno arrivò in ritardo, come sempre, e nessuno se ne stupì più di tanto quella sera. La stazione era vuota "
  "e il capostazione non aveva voglia di parlare con i pochi viaggiatori che erano scesi dal treno della sera."
)


def test_lingua_dal_testo_prima_dei_metadati():
  # Molti EPUB dicono «en» anche quando sono in italiano: vince il testo.
  assert detect_language(ITALIAN * 2, hint="en") == "it"
  assert detect_language(ENGLISH, hint="it") == "en"
  # Testo troppo corto per decidere: valgono i metadati, poi l'italiano.
  assert detect_language("Capitolo uno", hint="eng") == "en"
  assert detect_language("Capitolo uno") == "it"


def test_codici_lingua():
  assert normalize_language("en-US") == "en"
  assert normalize_language("ita") == "it"
  assert normalize_language("English") == "en"
  assert normalize_language("???") == ""


def test_numeri_in_lettere_solo_in_italiano():
  assert clean_for_speech("Era il 1847 e avevo 10 anni.") == "Era il milleottocentoquarantasette e avevo dieci anni."
  assert clean_for_speech("It was 1847 and I was 10.", language="en") == "It was 1847 and I was 10."
  assert clean_for_speech("Mr. Reed, 3,5%", extended=True, language="en") == "Mr. Reed, 3,5%"


def test_modello_secondo_la_memoria(monkeypatch):
  monkeypatch.delenv("GRILLO_TRADUTTORE", raising=False)
  assert choose_model(8) == "4b"
  assert choose_model(16) == "12b"
  assert choose_model(36) == "12b"
  monkeypatch.setenv("GRILLO_TRADUTTORE", "4b")
  assert choose_model(64) == "4b"


def test_richiesta_nel_formato_di_translategemma():
  prompt = build_prompt("Good night.", "en", context=("Hello.", "Ciao."))
  assert prompt.startswith("<start_of_turn>user\nYou are a professional English (en) to Italian (it) translator.")
  assert "into Italian:\n\n\nHello.<end_of_turn>\n<start_of_turn>model\nCiao.<end_of_turn>\n" in prompt
  assert prompt.endswith("into Italian:\n\n\nGood night.<end_of_turn>\n<start_of_turn>model\n")
  assert "<bos>" not in prompt


def test_paragrafi_lunghi_a_pezzi_a_fine_frase():
  paragraph = " ".join(["This is a sentence that goes on for a while, as they do."] * 40)
  pieces = split_pieces(paragraph, 300)
  assert all(len(piece) <= 300 for piece in pieces)
  assert " ".join(pieces) == paragraph
  assert all(piece.endswith(".") for piece in pieces)


def test_traduzioni_venute_male():
  assert looks_broken("Hello there, how are you?", "")
  assert looks_broken("Hello.", "Ciao. " * 40)
  assert not looks_broken("Hello there, how are you?", "Ciao, come stai?")


class FakeBackend:
  """Traduce mettendo «IT:» davanti: basta per controllare cosa arriva al modello e cosa torna nel libro."""

  def __init__(self):
    self.prompts: list[str] = []
    self.closed = False

  def generate(self, prompt, max_tokens):
    self.prompts.append(prompt)
    text = prompt.rsplit("into Italian:\n\n\n", 1)[1].split("<end_of_turn>")[0]
    return f"IT:{text}<end_of_turn>"

  def close(self):
    self.closed = True


class Quiet(EventEmitter):
  def __init__(self):
    self.events = []

  def emit(self, event_type, payload):
    self.events.append((event_type, payload))


@pytest.fixture
def book_store(tmp_path):
  store = BookStore(tmp_path, "libro")
  store.text_file(1).parent.mkdir(parents=True)
  store.text_file(1).write_text(f"CHAPTER I\n\n{ENGLISH}\n\n***\n\nThe end.", encoding="utf-8")
  store.text_file(2).write_text("Second chapter.", encoding="utf-8")
  store.save({
    "id": "libro", "title": "Libro", "kind": "libro", "speed": 1.0, "language": "en", "translate": True,
    "voice": {"id": "stella", "name": "Stella"},
    "chapters": [
      {"index": 1, "title": "CHAPTER I", "status": "pending", "chars": 10},
      {"index": 2, "title": "Parte 2", "status": "pending", "chars": 10},
    ],
  })
  return store


def fake_translator():
  backend = FakeBackend()
  return Translator("en", size="4b", log=lambda message: None, backend_factory=lambda model_id, log: backend), backend


def test_capitoli_tradotti_e_originale_conservato(book_store):
  translator, backend = fake_translator()
  book = book_store.load()
  done = translate_chapters(book_store, book, [1, 2], Quiet(), lambda: None, lambda *args: None, translator)
  assert done == 2
  text = book_store.text_file(1).read_text(encoding="utf-8")
  # Il cambio di scena resta com'è e non va al modello.
  assert text == f"IT:CHAPTER I\n\nIT:{ENGLISH}\n\n***\n\nIT:The end."
  assert "***" not in "".join(backend.prompts)
  # Ogni paragrafo ha davanti il precedente con la sua traduzione (saltando «***»).
  assert "The end.<end_of_turn>" in backend.prompts[2] and f"IT:{ENGLISH}<end_of_turn>" in backend.prompts[2]
  assert (book_store.dir / "text" / "original" / "001.txt").read_text(encoding="utf-8").startswith("CHAPTER I")
  saved = book_store.load()
  first, second = saved["chapters"]
  assert first["translated"] and first["title"] == "IT:CHAPTER I" and first["originalTitle"] == "CHAPTER I"
  assert first["chars"] == len(text)
  # «Parte 2» l'abbiamo scritta noi: non si traduce.
  assert second["title"] == "Parte 2"
  assert backend.closed
  assert not list((book_store.work_dir / "traduzione").glob("*.json"))


def test_traduzione_ripresa_dal_paragrafo_dove_si_era_fermata(book_store):
  translator, _ = fake_translator()
  cache = translation_job.cache_file(book_store, 1)
  cache.parent.mkdir(parents=True)
  cache.write_text(json.dumps({"model": translator.label, "paragraphs": ["GIA:CHAPTER I", "GIA:paragrafo"]}), encoding="utf-8")
  translator, backend = fake_translator()
  book = book_store.load()
  translate_chapters(book_store, book, [1], Quiet(), lambda: None, lambda *args: None, translator)
  assert book_store.text_file(1).read_text(encoding="utf-8") == "GIA:CHAPTER I\n\nGIA:paragrafo\n\n***\n\nIT:The end."
  # Solo l'ultimo paragrafo e il titolo arrivano al modello.
  assert len(backend.prompts) == 2


def test_spegnere_la_traduzione_rimette_l_originale(book_store):
  translator, _ = fake_translator()
  translate_chapters(book_store, book_store.load(), [1], Quiet(), lambda: None, lambda *args: None, translator)
  book = set_translation(book_store, False)
  assert not book["translate"]
  assert book["chapters"][0]["title"] == "CHAPTER I" and "translated" not in book["chapters"][0]
  assert book_store.text_file(1).read_text(encoding="utf-8").startswith("CHAPTER I\n\nThere was")


def test_lingua_non_si_cambia_a_capitoli_convertiti(book_store):
  book = book_store.load()
  book["chapters"][0]["status"] = "ready"
  book_store.save(book)
  with pytest.raises(RuntimeError):
    set_translation(book_store, False)


def test_lingua_della_voce():
  assert spoken_language({"language": "en", "translate": True}) == "it"
  assert spoken_language({"language": "en"}) == "en"
  assert spoken_language({}) == "it"
  english = settings_for_language(NATURALE, "en")
  assert not english.extended_cleanup and not english.own_duration and english.label != NATURALE.label
  assert settings_for_language(NATURALE, "it") is NATURALE


class FakeEngine:
  made: list[str] = []

  def __init__(self, voice, speed=1.0, log=print, settings=None, model=None, language="it"):
    self.voice, self.speed, self.settings, self.language, self.repaired = voice, speed, settings, language, False

  def load(self):
    pass

  def synthesize(self, text):
    FakeEngine.made.append((self.language, text))
    return np.zeros(2400, dtype=np.float32) + 0.1


@pytest.fixture
def fake_audio(monkeypatch):
  monkeypatch.delenv("GRILLO_PROFILO", raising=False)
  monkeypatch.setattr(conversion_job, "OmniVoiceEngine", FakeEngine)

  def fake_mp3(audio, rate, file):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_bytes(b"mp3")
    return len(audio) / rate

  monkeypatch.setattr(conversion_job, "write_mp3", fake_mp3)
  FakeEngine.made = []


def test_conversione_traduce_prima_di_leggere(book_store, fake_audio, monkeypatch):
  _, backend = fake_translator()
  monkeypatch.setattr(
    translation_job, "Translator",
    lambda source, log: Translator(source, size="4b", log=log, backend_factory=lambda model_id, log: backend),
  )
  emitter = Quiet()
  ConversionJob("libro", [1], str(book_store.dir.parent.parent), emitter, lambda: False).run()
  assert all(language == "it" for language, _ in FakeEngine.made)
  assert any(text.startswith("IT:") for _, text in FakeEngine.made)
  progress = [payload["progress"] for kind, payload in emitter.events if kind == "progress"]
  # Prima la traduzione (fino a 0,35), poi la voce: la barra non torna mai indietro.
  assert progress == sorted(progress) and progress[-1] == 1.0
  assert book_store.load()["chapters"][0]["status"] == "ready"


def test_libro_inglese_letto_in_inglese(book_store, fake_audio):
  book = book_store.load()
  book["translate"] = False
  book_store.save(book)
  ConversionJob("libro", [1], str(book_store.dir.parent.parent), Quiet(), lambda: False).run()
  assert FakeEngine.made and all(language == "en" for language, _ in FakeEngine.made)
  assert any("There was no possibility" in text for _, text in FakeEngine.made)


def test_lingua_del_file_prima_di_importarlo(tmp_path):
  from app.jobs.import_job import file_language

  english = tmp_path / "book.txt"
  english.write_text(f"CHAPTER I\n\n{ENGLISH}\n", encoding="utf-8")
  italian = tmp_path / "libro.txt"
  italian.write_text(f"Capitolo 1\n\n{ITALIAN}\n", encoding="utf-8")
  assert file_language(str(english)) == "en"
  assert file_language(str(italian)) == "it"
