"""Confronta la lettura dello stesso brano con impostazioni diverse: MP3 affiancati da ascoltare, più le misure.

Esempi (dalla radice del progetto, con l'ambiente Python dell'app):

  # lettura classica e naturale, brano di racconto, tre voci
  python backend/runtime/voice_compare.py --voci stella,brando,chiara

  # brano da articolo (numeri, date, abbreviazioni) con il campione da notiziario
  python backend/runtime/voice_compare.py --voci chiara --brano articolo

  # un libro già importato nella libreria (per titolo o identificativo), primi 1500 caratteri del capitolo 2
  python backend/runtime/voice_compare.py --voci stella --libro "atto creativo" --capitolo 2 --caratteri 1500

  # prova di un parametro: stessa lettura naturale con guidance_scale diverso
  python backend/runtime/voice_compare.py --voci stella --varianti naturale,naturale:guidance_scale=2.5

Per ogni voce e variante salva <uscita>/<brano>-<voce>-<variante>.mp3 e scrive in <uscita>/misure.json:
- velocità (lettere al secondo, pause escluse) accanto a quella del campione della voce;
- pause dentro i pezzi e pause montate tra frase, paragrafo e scena;
- intonazione (escursione della voce in semitoni) accanto a quella del campione;
- con --whisper, la trascrizione e il tasso di errore sulle parole: parole attaccate o saltate lo fanno salire.
Il giudizio finale resta a orecchio.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import fields, replace
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.audio.measure import speech_profile  # noqa: E402
from app.audio.montage import join_pieces, pause_after  # noqa: E402
from app.audio.mp3 import write_mp3  # noqa: E402
from app.chunking.chunker import chunk_chapters  # noqa: E402
from app.jobs.models import Chapter  # noqa: E402
from app.text_cleanup import clean_for_speech  # noqa: E402
from app.tts.omnivoice_engine import MODEL_ID, SAMPLE_RATE, OmniVoiceEngine, resolve_device, resolve_dtype  # noqa: E402
from app.tts.pacing import letter_count  # noqa: E402
from app.tts.settings import PROFILES, NarrationSettings  # noqa: E402
from app.voices import get_voice  # noqa: E402

RACCONTO = (
  "Il treno arrivò in ritardo, come sempre. Marta scese con la valigia in mano e si guardò intorno: la stazione era "
  "vuota, illuminata soltanto da un vecchio lampione. «Possibile che nessuno sia venuto a prendermi?» pensò, un po' "
  "delusa. Poi, in fondo al binario, vide una figura che agitava il braccio. Era suo fratello, con il cappello storto "
  "e il solito sorriso. «Scusa il ritardo» disse, «ma la strada era piena di neve.»"
)
ARTICOLO = (
  "Il 12/11/2026, alle 10:30, il prof. Luca Bianchi ha presentato a Milano i dati sull'energia: nel 2025 i consumi "
  "sono scesi del 3,5%, mentre la spesa delle famiglie è salita a 1.250 € l'anno. «È il calo più forte dal "
  "2008-2009», ha spiegato il dott. Rossi (Politecnico di Torino).\n\n"
  "Secondo il rapporto, pag. 14, oltre 2.000.000 di case hanno pannelli solari, impianti a pompa di calore, ecc. "
  "Il governo stanzierà € 40 milioni entro il XXI secolo... o almeno entro il prossimo anno. Per informazioni: "
  "www.energia-esempio.it."
)
BRANI = {"racconto": ("libro", RACCONTO), "articolo": ("articolo", ARTICOLO)}


def parse_variant(spec: str) -> tuple[str, NarrationSettings]:
  """«naturale», «classico» oppure «naturale:guidance_scale=2.5:t_shift=0.3»."""
  name, *changes = spec.split(":")
  if name not in PROFILES:
    raise SystemExit(f"Variante sconosciuta: {name}. Disponibili: {', '.join(PROFILES)}")
  settings = PROFILES[name]
  types = {field.name: field.type for field in fields(NarrationSettings)}
  values = {}
  for change in changes:
    key, _, raw = change.partition("=")
    if key not in types:
      raise SystemExit(f"Impostazione sconosciuta: {key}")
    current = getattr(settings, key)
    values[key] = raw.lower() in ("1", "true", "si", "sì") if isinstance(current, bool) else type(current)(raw)
  label = name + "".join(f"-{key}{value}" for key, value in values.items())
  return label, replace(settings, **values)


def book_text(library: Path, query: str, chapter: int, chars: int) -> tuple[str, str, str]:
  """Testo di un capitolo di un libro già importato, cercato per identificativo o per pezzo di titolo."""
  books = library.expanduser() / "books"
  wanted = query.lower()
  for folder in sorted(books.glob("*")):
    info_file = folder / "book.json"
    if not info_file.exists():
      continue
    info = json.loads(info_file.read_text(encoding="utf-8"))
    if wanted != folder.name.lower() and wanted not in info.get("title", "").lower():
      continue
    text = (folder / "text" / f"{chapter:03d}.txt").read_text(encoding="utf-8")
    if chars and len(text) > chars:
      # Si taglia a fine paragrafo, per non lasciare una frase a metà.
      cut = text.rfind("\n\n", 0, chars)
      text = text[:cut if cut > chars // 2 else chars]
    return folder.name, info.get("kind", "libro"), text
  raise SystemExit(f"Nessun libro con «{query}» in {books}")


def words(text: str) -> list[str]:
  return re.findall(r"[^\W\d_]+", text.lower().replace("’", "'"))


def word_error_rate(reference: list[str], heard: list[str]) -> float:
  """Parole sbagliate, saltate o aggiunte, su cento parole del testo."""
  previous = list(range(len(heard) + 1))
  for i, expected in enumerate(reference, start=1):
    current = [i]
    for j, got in enumerate(heard, start=1):
      current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (expected != got)))
    previous = current
  return previous[-1] / max(len(reference), 1)


def transcribe(model, audio: np.ndarray, limit: float = 25.0) -> str:
  """Trascrizione con Whisper, a tratti sotto i 30 secondi (il suo limite) tagliati nelle pause."""
  profile = speech_profile(audio, SAMPLE_RATE)
  cuts = [0.0]
  for start, end in profile.pauses:
    middle = (start + end) / 2
    following = min((s for s, _ in profile.pauses if s > end), default=profile.seconds)
    # Si taglia in questa pausa se arrivare alla prossima farebbe superare il limite.
    if following - cuts[-1] > limit and middle - cuts[-1] > 1.0:
      cuts.append(middle)
  cuts.append(profile.seconds)
  texts = []
  for start, end in zip(cuts, cuts[1:]):
    segment = audio[int(start * SAMPLE_RATE):int(end * SAMPLE_RATE)]
    for offset in range(0, len(segment), int(28 * SAMPLE_RATE)):  # senza pause: tratti fissi
      texts.append(model.transcribe((segment[np.newaxis, offset:offset + int(28 * SAMPLE_RATE)], SAMPLE_RATE)).strip())
  return " ".join(text for text in texts if text)


def pitch_range(audio: np.ndarray) -> dict | None:
  """Altezza media della voce e sua escursione (dal 10° al 90° percentile, in semitoni): piatta = cantilena."""
  try:
    import librosa

    f0, voiced, _ = librosa.pyin(audio.astype(np.float32), fmin=60, fmax=450, sr=SAMPLE_RATE, frame_length=1024)
  except Exception:  # librosa non c'è o non ce la fa: la misura è un di più
    return None
  f0 = f0[voiced & ~np.isnan(f0)]
  if f0.size < 20:
    return None
  semitones = 12 * np.log2(f0 / np.median(f0))
  return {"hz": round(float(np.median(f0)), 1), "escursione_st": round(float(np.percentile(semitones, 90) - np.percentile(semitones, 10)), 2)}


def measure(audio: np.ndarray, text: str) -> dict:
  profile = speech_profile(audio, SAMPLE_RATE)
  pauses = sorted(end - start for start, end in profile.pauses)
  result = {
    "secondi": round(profile.seconds, 2),
    "lettere_al_secondo": round(letter_count(text) / max(profile.speech_seconds, 0.1), 2),
    "pause": len(pauses),
    "pausa_mediana": round(float(np.median(pauses)), 2) if pauses else 0.0,
    "pausa_massima": round(pauses[-1], 2) if pauses else 0.0,
    "pause_totali": round(sum(pauses), 2),
  }
  pitch = pitch_range(audio)
  if pitch:
    result["voce_hz"] = pitch["hz"]
    result["escursione_st"] = pitch["escursione_st"]
  return result


def main() -> None:
  parser = argparse.ArgumentParser(description="Confronto tra impostazioni di lettura")
  parser.add_argument("--voci", default="stella,brando", help="identificativi separati da virgola")
  parser.add_argument("--varianti", default="classico,naturale", help="classico, naturale, naturale:chiave=valore…")
  parser.add_argument("--brano", default="racconto", choices=sorted(BRANI), help="brano di prova incluso")
  parser.add_argument("--testo-file", help="file di testo da leggere al posto del brano incluso")
  parser.add_argument("--libro", help="libro già importato: identificativo o pezzo del titolo")
  parser.add_argument("--capitolo", type=int, default=1)
  parser.add_argument("--caratteri", type=int, default=1200, help="quanti caratteri del capitolo leggere (0 = tutto)")
  parser.add_argument("--libreria", default="~/Documents/Grillo Parlante", help="cartella della libreria")
  parser.add_argument("--tipo", choices=["libro", "articolo"], help="campione da usare: racconto o notiziario")
  parser.add_argument("--uscita", default="confronto-voci")
  parser.add_argument("--velocita", type=float, default=1.0)
  parser.add_argument("--seme", type=int, default=1, help="seme della parte casuale, uguale per tutte le varianti")
  parser.add_argument("--whisper", action="store_true", help="trascrive ogni audio e conta gli errori (scarica Whisper)")
  args = parser.parse_args()

  if args.libro:
    name, kind, text = book_text(Path(args.libreria), args.libro, args.capitolo, args.caratteri)
    name = f"{name}-{args.capitolo:03d}"
  elif args.testo_file:
    name, kind, text = Path(args.testo_file).stem, "libro", Path(args.testo_file).read_text(encoding="utf-8")
  else:
    name = args.brano
    kind, text = BRANI[args.brano]
  kind = args.tipo or kind
  variants = [parse_variant(spec) for spec in args.varianti.split(",") if spec]
  output = Path(args.uscita)
  output.mkdir(parents=True, exist_ok=True)

  import torch
  from omnivoice import OmniVoice

  device = resolve_device()
  print(f"Carico OmniVoice su {device}", flush=True)
  model = OmniVoice.from_pretrained(MODEL_ID, device_map=device, dtype=resolve_dtype(device))
  if args.whisper:
    model.load_asr_model()

  report_file = output / "misure.json"
  report = json.loads(report_file.read_text(encoding="utf-8")) if report_file.exists() else {}
  for voice_id in [item for item in args.voci.split(",") if item]:
    voice = get_voice(voice_id).for_kind(kind)
    import soundfile as sf

    sample, _ = sf.read(str(voice.sample_path), dtype="float32")
    reference = measure(sample, voice.transcript)
    print(f"\n{voice.name} ({voice.sample_path.name}): campione {reference}", flush=True)
    for label, settings in variants:
      torch.manual_seed(args.seme)
      np.random.seed(args.seme)
      spoken = clean_for_speech(text, extended=settings.extended_cleanup)
      chunks = chunk_chapters([Chapter(id="c", title="", text=spoken)], settings.chunk_chars, settings.min_chunk_chars, settings.sentence_chunks)
      engine = OmniVoiceEngine(voice, args.velocita, log=lambda message: None, settings=settings, model=model)
      started = time.perf_counter()
      pieces = []
      for chunk in chunks:
        pieces.append((engine.synthesize(chunk.text), pause_after(chunk.text, chunk.ends_paragraph, chunk.scene_break, settings)))
        print(f"  {label}: pezzo {len(pieces)}/{len(chunks)} ({len(chunk.text)} caratteri)", flush=True)
      audio = join_pieces(pieces, settings, SAMPLE_RATE)
      target = output / f"{name}-{voice_id}-{label}.mp3"
      write_mp3(audio, SAMPLE_RATE, target)

      result = measure(audio, spoken)
      result.update({
        "pezzi": len(chunks),
        "pezzi_rifatti": engine.retried,
        "velocita_sul_campione": round(result["lettere_al_secondo"] / reference["lettere_al_secondo"], 3),
        "secondi_di_calcolo": round(time.perf_counter() - started, 1),
        "impostazioni": settings.label,
      })
      if args.whisper:
        heard = transcribe(model, audio)
        # Whisper scrive le cifre come cifre: si riportano in lettere come nel testo letto.
        result["trascrizione"] = heard
        result["errori_parole"] = round(word_error_rate(words(spoken), words(clean_for_speech(heard, extended=True))), 4)
      report.setdefault(name, {}).setdefault(voice_id, {"campione": reference})[label] = result
      report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
      shown = {key: value for key, value in result.items() if key not in ("trascrizione", "impostazioni")}
      print(f"  {label}: {target.name} {shown}", flush=True)

  print(f"\nFatto: MP3 e misure.json in {output.resolve()}")


if __name__ == "__main__":
  main()
