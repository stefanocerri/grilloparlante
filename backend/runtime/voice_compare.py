"""Confronto a orecchio tra motori TTS per l'italiano.

Genera lo stesso brano con piu motori/voci, misura i tempi e scrive una pagina
HTML (anche "alla cieca") per ascoltare i risultati uno accanto all'altro.

Motori supportati (ognuno e opzionale: se il pacchetto manca viene saltato):

  supertonic  -> motore di default dell'app (pip install supertonic)
  kokoro      -> Kokoro-82M via ONNX, voci if_sara / im_nicola (pip install kokoro-onnx)
  chatterbox  -> Chatterbox Multilingual, MIT, clonazione da sample (pip install chatterbox-tts)
  voxcpm      -> VoxCPM2, Apache-2.0, clonazione + voice design (pip install voxcpm)
  qwen        -> Qwen3-TTS 0.6B Base, gia usato dall'app per il voice cloning

I motori con PyTorch hanno dipendenze in conflitto tra loro: conviene un venv
per motore e lanciare lo script piu volte sulla stessa cartella --out. I
risultati si accumulano in results.json e la pagina HTML viene rigenerata.

Esempi:

  # solo i motori leggeri, nessun sample richiesto
  python backend/runtime/voice_compare.py --engines supertonic,kokoro

  # crea una voce narrante sintetica (nessuna persona reale) con VoxCPM2
  python backend/runtime/voice_compare.py --engines voxcpm \\
      --design "Voce maschile italiana, baritonale, calda, ritmo pacato da audiolibro"

  # clonazione a partire da un sample (es. la voce creata sopra)
  python backend/runtime/voice_compare.py --engines chatterbox,voxcpm,qwen \\
      --reference output/voice-compare/design/voce_design.wav
"""

from __future__ import annotations

import argparse
import html
import inspect
import json
import os
import random
import sys
import time
import traceback
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
  sys.path.insert(0, str(BACKEND_ROOT))

DEFAULT_TEXT = (
  "Capitolo terzo. La pioggia aveva smesso di cadere poco prima delle sette, "
  "e Lucia aprì la finestra della cucina per lasciar entrare l'odore della terra bagnata. "
  "«Non pensavo che saresti tornato», disse senza voltarsi. "
  "Marco posò la valigia accanto alla porta: era la stessa di vent'anni prima, "
  "consumata agli angoli e chiusa con una cinghia di cuoio. "
  "Perché, si chiese, certe cose sembrano più facili da dire quando nessuno ti guarda negli occhi?"
)

ALL_ENGINES = ("supertonic", "kokoro", "chatterbox", "voxcpm", "qwen")

INSTALL_HINTS = {
  "supertonic": "pip install 'supertonic>=1.3.1' onnxruntime soundfile",
  "kokoro": "pip install kokoro-onnx soundfile",
  "chatterbox": "pip install chatterbox-tts 'setuptools<81'  (venv separato consigliato)",
  "voxcpm": "pip install voxcpm  (venv separato consigliato)",
  "qwen": "pip install qwen-tts==0.1.1 'setuptools<81'  (o runtime gestito dell'app)",
}

KOKORO_MODEL_URL = (
  "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
)
KOKORO_VOICES_URL = (
  "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
)


@dataclass
class Sample:
  engine: str
  variant: str
  file: str
  ok: bool
  elapsedSec: float = 0.0
  audioSec: float = 0.0
  rtf: float = 0.0
  error: str = ""
  notes: dict[str, Any] = field(default_factory=dict)


# --- utilita -----------------------------------------------------------------


def log(message: str) -> None:
  print(f"[voice-compare] {message}", flush=True)


def resolve_device(requested: str) -> str:
  if requested != "auto":
    return requested
  try:
    import torch

    if torch.cuda.is_available():
      return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
      return "mps"
  except Exception:
    pass
  return "cpu"


def to_numpy(audio: Any) -> Any:
  import numpy as np

  if hasattr(audio, "detach"):
    audio = audio.detach().cpu().float().numpy()
  audio = np.asarray(audio, dtype="float32")
  return audio.squeeze()


def write_wav(path: Path, audio: Any, sample_rate: int) -> float:
  import soundfile as sf

  data = to_numpy(audio)
  path.parent.mkdir(parents=True, exist_ok=True)
  sf.write(str(path), data, int(sample_rate))
  return float(data.shape[-1]) / float(sample_rate) if data.size else 0.0


def call_with_supported_kwargs(fn: Callable[..., Any], **kwargs: Any) -> Any:
  """Passa solo gli argomenti accettati dalla firma (le API cambiano tra versioni)."""
  try:
    params = inspect.signature(fn).parameters
  except (TypeError, ValueError):
    return fn(**kwargs)
  if any(p.kind is inspect.Parameter.VAR_KEYWORD for p in params.values()):
    return fn(**kwargs)
  return fn(**{key: value for key, value in kwargs.items() if key in params and value is not None})


def download(url: str, target: Path) -> Path:
  if target.exists() and target.stat().st_size > 0:
    return target
  target.parent.mkdir(parents=True, exist_ok=True)
  log(f"download {url}")
  partial = target.with_suffix(target.suffix + ".part")
  with urllib.request.urlopen(url) as response, open(partial, "wb") as handle:
    while True:
      chunk = response.read(1 << 20)
      if not chunk:
        break
      handle.write(chunk)
  partial.replace(target)
  return target


def slug(value: str) -> str:
  cleaned = "".join(ch if ch.isalnum() or ch in "-_." else "-" for ch in value)
  return cleaned.strip("-") or "variant"


# --- motori ------------------------------------------------------------------
#
# Ogni motore restituisce una lista di (variante, funzione) dove la funzione
# scrive il wav e ritorna (secondi_audio, note).

Job = tuple[str, Callable[[Path], tuple[float, dict[str, Any]]]]


def engine_supertonic(args: argparse.Namespace) -> list[Job]:
  from supertonic import TTS

  tts = TTS(os.getenv("GRILLO_SUPERTONIC_MODEL", "supertonic-3"), auto_download=True)
  voices = args.supertonic_voices.split(",")
  steps_list = [int(value) for value in args.supertonic_steps.split(",")]
  jobs: list[Job] = []

  for voice in voices:
    style = tts.get_voice_style(voice.strip())
    for steps in steps_list:

      def run(path: Path, style=style, steps=steps, voice=voice) -> tuple[float, dict[str, Any]]:
        wav, _duration = tts.synthesize(
          text=args.text, voice_style=style, lang="it", total_steps=steps, speed=args.speed
        )
        tts.save_audio(wav, str(path))
        import soundfile as sf

        info = sf.info(str(path))
        return info.frames / info.samplerate, {"voice": voice, "steps": steps}

      jobs.append((f"{voice.strip()}-steps{steps}", run))
  return jobs


def engine_kokoro(args: argparse.Namespace) -> list[Job]:
  from kokoro_onnx import Kokoro

  cache = Path(args.cache_dir) / "kokoro"
  model_path = download(KOKORO_MODEL_URL, cache / "kokoro-v1.0.onnx")
  voices_path = download(KOKORO_VOICES_URL, cache / "voices-v1.0.bin")
  kokoro = Kokoro(str(model_path), str(voices_path))
  jobs: list[Job] = []

  for voice in args.kokoro_voices.split(","):
    voice = voice.strip()

    def run(path: Path, voice=voice) -> tuple[float, dict[str, Any]]:
      samples, sample_rate = kokoro.create(args.text, voice=voice, speed=args.speed, lang="it")
      return write_wav(path, samples, sample_rate), {"voice": voice}

    jobs.append((voice, run))
  return jobs


def engine_chatterbox(args: argparse.Namespace) -> list[Job]:
  if not args.reference:
    raise SkipEngine("serve --reference (Chatterbox clona sempre da un sample)")

  from chatterbox.mtl_tts import ChatterboxMultilingualTTS

  device = resolve_device(args.device)
  model = ChatterboxMultilingualTTS.from_pretrained(device=device)
  jobs: list[Job] = []

  # exaggeration ~ espressivita, cfg_weight ~ aderenza/ritmo (piu basso = piu lento e calmo)
  for exaggeration, cfg_weight in ((0.5, 0.5), (0.4, 0.3)):

    def run(path: Path, exaggeration=exaggeration, cfg_weight=cfg_weight) -> tuple[float, dict[str, Any]]:
      wav = call_with_supported_kwargs(
        model.generate,
        text=args.text,
        language_id="it",
        audio_prompt_path=args.reference,
        exaggeration=exaggeration,
        cfg_weight=cfg_weight,
      )
      return write_wav(path, wav, model.sr), {
        "device": device, "exaggeration": exaggeration, "cfg_weight": cfg_weight
      }

    jobs.append((f"clone-exag{exaggeration}-cfg{cfg_weight}", run))
  return jobs


_VOXCPM_CACHE: dict[str, tuple[Any, int]] = {}


def _voxcpm_model(args: argparse.Namespace) -> tuple[Any, int]:
  # Caricato una sola volta: --design e il motore voxcpm lo condividono (sono ~2B parametri).
  if args.voxcpm_model in _VOXCPM_CACHE:
    return _VOXCPM_CACHE[args.voxcpm_model]

  from voxcpm import VoxCPM

  model = call_with_supported_kwargs(
    VoxCPM.from_pretrained,
    hf_model_id=args.voxcpm_model,
    load_denoiser=False,
    optimize=False,  # torch.compile e lento/instabile su Apple Silicon
    device=resolve_device(args.device),
  )
  sample_rate = getattr(getattr(model, "tts_model", None), "sample_rate", None) or 48000
  _VOXCPM_CACHE[args.voxcpm_model] = (model, int(sample_rate))
  return _VOXCPM_CACHE[args.voxcpm_model]


def _voxcpm_generate(model: Any, text: str, args: argparse.Namespace, **extra: Any) -> Any:
  return call_with_supported_kwargs(
    model.generate,
    text=text,
    cfg_value=2.0,
    inference_timesteps=10,
    normalize=True,
    **extra,
  )


def engine_voxcpm(args: argparse.Namespace) -> list[Job]:
  model, sample_rate = _voxcpm_model(args)
  jobs: list[Job] = []

  if args.reference:

    def run_clone(path: Path) -> tuple[float, dict[str, Any]]:
      extra: dict[str, Any] = {"reference_wav_path": args.reference, "prompt_wav_path": args.reference}
      if args.reference_text:
        extra["prompt_text"] = args.reference_text
      else:
        # Senza trascrizione VoxCPM1.x non accetta prompt_wav_path: usa solo il riferimento v2.
        extra.pop("prompt_wav_path")
      wav = _voxcpm_generate(model, args.text, args, **extra)
      return write_wav(path, wav, sample_rate), {"mode": "clone"}

    jobs.append(("clone", run_clone))

  for index, description in enumerate(args.voxcpm_designs):

    def run_design(path: Path, description=description) -> tuple[float, dict[str, Any]]:
      wav = _voxcpm_generate(model, f"({description}){args.text}", args)
      return write_wav(path, wav, sample_rate), {"mode": "design", "description": description}

    jobs.append((f"design{index + 1}", run_design))

  return jobs


def engine_qwen(args: argparse.Namespace) -> list[Job]:
  if not args.reference:
    raise SkipEngine("serve --reference (Qwen Base clona sempre da un sample)")

  try:
    from app.tts.runtime_bootstrap import prepare_third_party_runtime

    prepare_third_party_runtime(None)
  except Exception:
    pass

  import torch
  from qwen_tts import Qwen3TTSModel

  device = resolve_device(args.device)
  model = Qwen3TTSModel.from_pretrained(
    args.qwen_model,
    device_map=device if device in {"cpu", "cuda"} else "cpu",
    dtype=torch.float32,
  )
  prompt_kwargs: dict[str, Any] = {
    "ref_audio": args.reference,
    "x_vector_only_mode": not bool(args.reference_text),
  }
  if args.reference_text:
    prompt_kwargs["ref_text"] = args.reference_text
  prompt = model.create_voice_clone_prompt(**prompt_kwargs)

  def run(path: Path) -> tuple[float, dict[str, Any]]:
    wavs, sample_rate = model.generate_voice_clone(
      text=args.text, language="Italian", voice_clone_prompt=prompt
    )
    return write_wav(path, wavs[0], sample_rate), {"device": device, "model": args.qwen_model}

  return [("clone", run)]


class SkipEngine(Exception):
  pass


ENGINE_BUILDERS: dict[str, Callable[[argparse.Namespace], list[Job]]] = {
  "supertonic": engine_supertonic,
  "kokoro": engine_kokoro,
  "chatterbox": engine_chatterbox,
  "voxcpm": engine_voxcpm,
  "qwen": engine_qwen,
}


# --- voice design: crea un sample di riferimento sintetico --------------------


DESIGN_SCRIPT = (
  "Buongiorno. Questa è la mia voce di narrazione: calma, chiara e naturale. "
  "Leggo con un ritmo regolare, rispetto le pause e do il giusto peso alle parole."
)


def run_design(args: argparse.Namespace, out_dir: Path) -> Path:
  """Genera con VoxCPM2 una voce che non appartiene a nessuno, da usare come --reference."""
  model, sample_rate = _voxcpm_model(args)
  target = out_dir / "design" / "voce_design.wav"
  wav = _voxcpm_generate(model, f"({args.design}){DESIGN_SCRIPT}", args)
  seconds = write_wav(target, wav, sample_rate)
  (target.with_suffix(".txt")).write_text(DESIGN_SCRIPT + "\n", encoding="utf-8")
  (target.with_suffix(".json")).write_text(
    json.dumps({"description": args.design, "text": DESIGN_SCRIPT, "seconds": seconds}, ensure_ascii=False, indent=2),
    encoding="utf-8",
  )
  log(f"voce di riferimento creata: {target} ({seconds:.1f}s)")
  log("riascoltala: se ti piace, usala con --reference e --reference-text-file sul .txt accanto")
  return target


# --- report ------------------------------------------------------------------


def load_results(path: Path) -> list[dict[str, Any]]:
  if not path.exists():
    return []
  try:
    return json.loads(path.read_text(encoding="utf-8")).get("samples", [])
  except Exception:
    return []


def merge_results(previous: list[dict[str, Any]], new: Iterable[Sample]) -> list[dict[str, Any]]:
  merged = {(item["engine"], item["variant"]): item for item in previous}
  for sample in new:
    merged[(sample.engine, sample.variant)] = asdict(sample)
  # un motore che ora funziona non deve piu comparire tra quelli saltati
  working = {engine for (engine, variant), item in merged.items() if item["ok"]}
  for engine in working:
    merged.pop((engine, "-"), None)
  return sorted(merged.values(), key=lambda item: (item["engine"], item["variant"]))


def write_report(out_dir: Path, samples: list[dict[str, Any]], text: str, blind: bool) -> Path:
  ok_samples = [item for item in samples if item["ok"]]
  rows = []
  order = list(ok_samples)
  key_map: dict[str, str] = {}
  if blind:
    random.Random(len(order)).shuffle(order)

  for index, item in enumerate(order, start=1):
    label = f"Campione {index}" if blind else f"{item['engine']} / {item['variant']}"
    key_map[label] = f"{item['engine']} / {item['variant']}"
    meta = "" if blind else (
      f"<small>{item['elapsedSec']:.1f}s di calcolo, {item['audioSec']:.1f}s di audio, "
      f"RTF {item['rtf']:.2f}</small>"
    )
    rows.append(
      f"<tr><td><b>{html.escape(label)}</b><br>{meta}</td>"
      f"<td><audio controls preload='none' src='{html.escape(item['file'])}'></audio></td>"
      f"<td><select><option>-</option>" + "".join(f"<option>{n}</option>" for n in range(1, 6)) +
      "</select></td></tr>"
    )

  failures = "".join(
    f"<li><b>{html.escape(item['engine'])} / {html.escape(item['variant'])}</b>: "
    f"<code>{html.escape(item['error'].splitlines()[0] if item['error'] else '')}</code></li>"
    for item in samples if not item["ok"]
  )
  reveal = ""
  if blind:
    reveal = (
      "<details><summary>Mostra quale motore e quale (solo dopo aver votato)</summary><ul>"
      + "".join(f"<li>{html.escape(k)} &rarr; {html.escape(v)}</li>" for k, v in key_map.items())
      + "</ul></details>"
    )

  page = f"""<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><title>Confronto voci italiane</title>
<style>
body{{font-family:-apple-system,system-ui,sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;color:#222}}
table{{border-collapse:collapse;width:100%}}td{{border-bottom:1px solid #ddd;padding:.6rem;vertical-align:middle}}
blockquote{{background:#f6f6f6;padding:1rem;border-left:4px solid #999}}audio{{width:420px}}
</style></head><body>
<h1>Confronto voci italiane</h1>
<p>Testo letto da tutti i campioni:</p><blockquote>{html.escape(text)}</blockquote>
<p>Vota da 1 a 5 naturalezza, pronuncia e intonazione. Usa le cuffie.</p>
<table>{''.join(rows)}</table>
{reveal}
{'<h2>Motori non riusciti / saltati</h2><ul>' + failures + '</ul>' if failures else ''}
</body></html>
"""
  target = out_dir / ("index_cieco.html" if blind else "index.html")
  target.write_text(page, encoding="utf-8")
  return target


# --- main --------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(description="Confronto a orecchio tra motori TTS italiani.")
  parser.add_argument("--engines", default="supertonic,kokoro", help=f"lista tra: {','.join(ALL_ENGINES)} oppure 'all'")
  parser.add_argument("--text", default=DEFAULT_TEXT)
  parser.add_argument("--text-file", help="file con il testo da leggere (sovrascrive --text)")
  parser.add_argument("--out", default=str(REPO_ROOT / "output" / "voice-compare"))
  parser.add_argument("--cache-dir", default=str(Path.home() / ".cache" / "grillo-voice-compare"))
  parser.add_argument("--device", default="auto", help="auto, cpu, cuda, mps")
  parser.add_argument("--speed", type=float, default=1.0)
  parser.add_argument("--reference", help="wav di riferimento per i motori che clonano (5-15s, voce pulita)")
  parser.add_argument("--reference-text", default="", help="trascrizione esatta del riferimento (migliora la clonazione)")
  parser.add_argument("--reference-text-file", help="file con la trascrizione del riferimento")
  parser.add_argument("--design", help="crea prima una voce sintetica con VoxCPM2 da questa descrizione e usala come riferimento")
  parser.add_argument("--supertonic-voices", default="F1,F2,F3,F4,F5,M1,M2,M3,M4,M5")
  parser.add_argument("--supertonic-steps", default="8,16")
  parser.add_argument("--kokoro-voices", default="if_sara,im_nicola")
  parser.add_argument("--voxcpm-model", default="openbmb/VoxCPM2")
  parser.add_argument(
    "--voxcpm-design",
    dest="voxcpm_designs",
    action="append",
    help="descrizione di voce per VoxCPM2 senza riferimento (ripetibile)",
  )
  parser.add_argument("--qwen-model", default="Qwen/Qwen3-TTS-12Hz-0.6B-Base")
  parser.add_argument("--no-blind", action="store_true", help="non generare la pagina alla cieca")
  return parser


def main() -> int:
  args = build_parser().parse_args()

  if args.text_file:
    args.text = Path(args.text_file).read_text(encoding="utf-8").strip()
  if args.reference_text_file:
    args.reference_text = Path(args.reference_text_file).read_text(encoding="utf-8").strip()
  if args.reference:
    args.reference = str(Path(args.reference).expanduser().resolve())
  if not args.voxcpm_designs:
    args.voxcpm_designs = [
      "Voce femminile italiana adulta, calda e chiara, tono da narratrice di audiolibri",
      "Voce maschile italiana matura, profonda e pacata, tono da narratore di audiolibri",
    ]

  out_dir = Path(args.out).expanduser().resolve()
  out_dir.mkdir(parents=True, exist_ok=True)

  if args.design:
    try:
      reference = run_design(args, out_dir)
    except Exception as error:
      log(f"voice design non riuscito: {error}. Installa: {INSTALL_HINTS['voxcpm']}")
      return 1
    args.reference = str(reference)
    args.reference_text = DESIGN_SCRIPT

  engines = list(ALL_ENGINES) if args.engines.strip() == "all" else [
    name.strip() for name in args.engines.split(",") if name.strip()
  ]
  unknown = [name for name in engines if name not in ENGINE_BUILDERS]
  if unknown:
    log(f"motori sconosciuti: {', '.join(unknown)}")
    return 2

  samples: list[Sample] = []
  for engine in engines:
    log(f"== {engine} ==")
    try:
      load_started = time.perf_counter()
      jobs = ENGINE_BUILDERS[engine](args)
      log(f"{engine} pronto in {time.perf_counter() - load_started:.1f}s, {len(jobs)} varianti")
    except SkipEngine as reason:
      log(f"{engine} saltato: {reason}")
      samples.append(Sample(engine, "-", "", False, error=f"saltato: {reason}"))
      continue
    except ImportError as error:
      log(f"{engine} non installato ({error}). Installa: {INSTALL_HINTS[engine]}")
      samples.append(Sample(engine, "-", "", False, error=f"non installato: {INSTALL_HINTS[engine]}"))
      continue
    except Exception as error:
      log(f"{engine} non caricato: {error}")
      samples.append(Sample(engine, "-", "", False, error=traceback.format_exc()))
      continue

    for variant, run in jobs:
      relative = f"{engine}/{slug(variant)}.wav"
      path = out_dir / relative
      path.parent.mkdir(parents=True, exist_ok=True)
      started = time.perf_counter()
      try:
        audio_sec, notes = run(path)
        elapsed = time.perf_counter() - started
        rtf = elapsed / audio_sec if audio_sec else 0.0
        samples.append(Sample(engine, variant, relative, True, round(elapsed, 2), round(audio_sec, 2), round(rtf, 3), notes=notes))
        log(f"  {variant}: {elapsed:.1f}s per {audio_sec:.1f}s di audio (RTF {rtf:.2f})")
      except Exception as error:
        samples.append(Sample(engine, variant, relative, False, error=traceback.format_exc()))
        log(f"  {variant}: errore {error}")

  results_path = out_dir / "results.json"
  merged = merge_results(load_results(results_path), samples)
  results_path.write_text(
    json.dumps({"text": args.text, "samples": merged}, ensure_ascii=False, indent=2), encoding="utf-8"
  )
  report = write_report(out_dir, merged, args.text, blind=False)
  log(f"report: {report}")
  if not args.no_blind:
    log(f"report alla cieca: {write_report(out_dir, merged, args.text, blind=True)}")

  return 0 if any(sample.ok for sample in samples) else 1


if __name__ == "__main__":
  raise SystemExit(main())
