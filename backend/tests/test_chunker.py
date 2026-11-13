from app.chunking.chunker import chunk_chapters, split_sentences
from app.jobs.models import Chapter

LIMIT, MINIMUM = 280, 70


def chunks_of(text: str):
  return chunk_chapters([Chapter(id="c", title="", text=text)], LIMIT, MINIMUM, by_sentence=True)


def sentence(words: int, end: str = ".") -> str:
  return "Parola " + " ".join(["parola"] * (words - 1)) + end


def test_frasi_non_divise_dopo_iniziali_e_battute():
  text = "«Possibile che nessuno sia venuto?» pensò, delusa. J. R. R. Tolkien scrisse molto. Poi basta!"
  assert split_sentences(text) == [
    "«Possibile che nessuno sia venuto?» pensò, delusa.",
    "J. R. R. Tolkien scrisse molto.",
    "Poi basta!",
  ]


def test_pezzi_entro_il_limite_e_a_fine_frase():
  paragraph = " ".join(sentence(12) for _ in range(12))
  chunks = chunks_of(paragraph)
  assert len(chunks) > 1
  for chunk in chunks:
    assert len(chunk.text) <= LIMIT
    assert chunk.text.endswith(".")
    assert len(chunk.text) >= MINIMUM
  assert " ".join(chunk.text for chunk in chunks) == paragraph


def test_solo_l_ultimo_pezzo_chiude_il_paragrafo():
  paragraph = " ".join(sentence(12) for _ in range(8))
  chunks = chunks_of(f"{paragraph}\n\n{paragraph}")
  closing = [chunk.ends_paragraph for chunk in chunks]
  assert closing.count(True) == 2
  assert closing[-1] is True
  # Un pezzo non scavalca mai il paragrafo quando i paragrafi sono lunghi.
  assert all("\n" not in chunk.text for chunk in chunks)


def test_paragrafi_corti_uniti_al_vicino():
  long = " ".join(sentence(12) for _ in range(3))
  chunks = chunks_of(f"«Ciao.»\n\n«Come stai?»\n\n{long}")
  assert chunks[0].text.startswith("«Ciao.»\n«Come stai?»\n")
  assert all(len(chunk.text) >= MINIMUM for chunk in chunks)


def test_ultimo_paragrafo_corto_unito_al_precedente():
  long = " ".join(sentence(12) for _ in range(2))
  chunks = chunks_of(f"{long}\n\nFine.")
  assert len(chunks) == 1
  assert chunks[0].text.endswith("\nFine.")
  assert chunks[0].ends_paragraph


def test_cambio_di_scena():
  long = " ".join(sentence(12) for _ in range(2))
  for mark in ("***", "* * *", "—", "---", "⁂"):
    chunks = chunks_of(f"{long}\n\n{mark}\n\n{long}")
    assert [chunk.scene_break for chunk in chunks] == [True, False], mark
    assert all(mark not in chunk.text for chunk in chunks)


def test_paragrafo_corto_non_attraversa_il_cambio_di_scena():
  long = " ".join(sentence(12) for _ in range(3))
  chunks = chunks_of(f"{long}\n\nBreve.\n\n***\n\n{long}")
  assert chunks[0].text.endswith("\nBreve.")
  assert chunks[0].scene_break
  assert chunks[1].text == long


def test_frase_lunghissima_divisa_alle_virgole():
  clause = "parola " * 14 + "parola"
  text = ", ".join([clause] * 6) + "."
  chunks = chunks_of(text)
  assert len(chunks) > 1
  assert all(len(chunk.text) <= LIMIT for chunk in chunks)
  assert all(chunk.text.endswith(",") for chunk in chunks[:-1])
  assert [chunk.ends_paragraph for chunk in chunks] == [False] * (len(chunks) - 1) + [True]


def test_divisione_classica_invariata():
  # Le voci create dall'utente usano ancora la divisione di prima: più paragrafi nello stesso pezzo.
  paragraph = " ".join(sentence(10) for _ in range(3))
  chunks = chunk_chapters([Chapter(id="c", title="", text=f"{paragraph}\n\n{paragraph}\n\nCoda breve.")], 600)
  assert len(chunks) == 1
  assert chunks[0].text == f"{paragraph}\n\n{paragraph}\n\nCoda breve."
  assert chunks[0].id == "c-part-001"


def test_frase_poco_oltre_il_limite_resta_intera():
  # 300 caratteri circa: dividerla ai due punti farebbe ripartire l'intonazione a metà frase.
  long_sentence = "Il professore ha presentato i dati: " + "parola " * 36 + "fine."
  assert LIMIT < len(long_sentence) <= LIMIT * 1.2
  chunks = chunks_of(f"{long_sentence} {sentence(14)}")
  assert [chunk.text for chunk in chunks] == [long_sentence, sentence(14)]
