from __future__ import annotations

import argparse
import json
import os
import platform
import sys
import time
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
  sys.path.insert(0, str(BACKEND_ROOT))

from app.tts.runtime_bootstrap import prepare_third_party_runtime


def directory_size(path: Path | None) -> int:
  if path is None or not path.exists():
    return 0

  total = 0
  for candidate in path.rglob("*"):
    if candidate.is_file():
      total += candidate.stat().st_size
  return total


def build_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(description="Developer benchmark for the managed Qwen runtime.")
  parser.add_argument("--model-name", default="Qwen/Qwen3-TTS-12Hz-0.6B-Base")
  parser.add_argument("--text", required=True)
  parser.add_argument("--reference-path", required=True)
  parser.add_argument("--reference-text", default="")
  parser.add_argument("--output-path", required=True)
  parser.add_argument("--device", default=os.getenv("GRILLO_QWEN_DEVICE", "cpu"))
  parser.add_argument("--probe-load", action="store_true")
  return parser


def resolve_dtype(torch_module):
  configured = os.getenv("GRILLO_QWEN_DTYPE", "").strip().lower()
  if configured == "bfloat16":
    return torch_module.bfloat16
  if configured == "float16":
    return torch_module.float16
  return torch_module.float32


def main() -> int:
  parser = build_parser()
  args = parser.parse_args()

  reference_path = Path(args.reference_path).expanduser().resolve()
  output_path = Path(args.output_path).expanduser().resolve()
  runtime_root = reference_path.parent.parent if reference_path.exists() else None
  prepare_third_party_runtime(runtime_root)

  result: dict[str, object] = {
    "ok": False,
    "runtimeRoot": str(runtime_root) if runtime_root else None,
    "modelName": args.model_name,
    "device": args.device,
    "python": sys.version.split()[0],
    "platform": platform.platform(),
    "machine": platform.machine(),
    "referencePath": str(reference_path),
    "referenceTextProvided": bool(args.reference_text.strip()),
    "xVectorOnlyMode": not bool(args.reference_text.strip()),
    "outputPath": str(output_path),
    "runtimeFootprintBytes": directory_size(runtime_root)
  }

  started_at = time.perf_counter()

  try:
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel

    load_started = time.perf_counter()
    load_kwargs: dict[str, object] = {
      "device_map": args.device if args.device in {"cpu", "cuda", "auto"} else "cpu",
      "dtype": resolve_dtype(torch)
    }
    if load_kwargs["device_map"] == "cuda":
      load_kwargs["attn_implementation"] = "flash_attention_2"

    model = Qwen3TTSModel.from_pretrained(args.model_name, **load_kwargs)
    result["loadMs"] = round((time.perf_counter() - load_started) * 1000, 2)

    if args.probe_load:
      result["ok"] = True
      result["totalMs"] = round((time.perf_counter() - started_at) * 1000, 2)
      print(json.dumps(result, ensure_ascii=False), flush=True)
      return 0

    prompt_started = time.perf_counter()
    prompt_kwargs: dict[str, object] = {
      "ref_audio": str(reference_path),
      "x_vector_only_mode": not bool(args.reference_text.strip())
    }
    if args.reference_text.strip():
      prompt_kwargs["ref_text"] = args.reference_text.strip()

    prompt = model.create_voice_clone_prompt(**prompt_kwargs)
    result["promptMs"] = round((time.perf_counter() - prompt_started) * 1000, 2)

    synth_started = time.perf_counter()
    wavs, sample_rate = model.generate_voice_clone(
      text=args.text,
      language="Auto",
      voice_clone_prompt=prompt
    )
    audio = wavs[0]
    if hasattr(audio, "detach"):
      audio = audio.detach().cpu().float().numpy()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), audio, sample_rate)
    result["synthesisMs"] = round((time.perf_counter() - synth_started) * 1000, 2)
    result["sampleRate"] = sample_rate
    result["outputBytes"] = output_path.stat().st_size
    result["ok"] = True
  except Exception as error:  # pragma: no cover - developer utility
    result["error"] = str(error)

  result["totalMs"] = round((time.perf_counter() - started_at) * 1000, 2)
  print(json.dumps(result, ensure_ascii=False), flush=True)
  return 0 if result["ok"] else 1


if __name__ == "__main__":
  raise SystemExit(main())
