from __future__ import annotations

import json
import os
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from app.audio.ffmpeg_merge import merge_audio_chunks
from app.chaptering.heading_detector import detect_from_headings, fallback_sections
from app.chaptering.toc_detector import detect_from_toc
from app.chunking.chunker import chunk_chapters
from app.config.defaults import merge_settings
from app.extractors.epub_extractor import extract_epub
from app.extractors.pdf_extractor import extract_pdf
from app.extractors.text_extractor import extract_text_file
from app.file_detector import detect_file_type
from app.jobs.models import Chapter, Chunk, ExtractedDocument
from app.outputs.manifest_writer import write_outputs
from app.tts.factory import create_tts_adapter
from app.utils.events import EventEmitter
from app.utils.files import ensure_directory, slugify, stable_slug

PROGRESS_ANCHORS = {
  "ingest": (0.02, 0.1),
  "extract": (0.1, 0.28),
  "chaptering": (0.28, 0.42),
  "chunking": (0.42, 0.56),
  "tts": (0.56, 0.88),
  "merge": (0.88, 0.96),
  "finalize": (0.96, 1.0)
}


class JobCancelled(Exception):
  pass


class ConversionJob:
  def __init__(
    self,
    input_path: str,
    raw_settings: dict | None,
    emitter: EventEmitter,
    is_cancelled: Callable[[], bool]
  ) -> None:
    self.input_path = Path(input_path).expanduser().resolve()
    self.settings = merge_settings(raw_settings)
    self.emitter = emitter
    self.is_cancelled = is_cancelled
    self.started_at = time.monotonic()
    self.job_id = f"{int(time.time())}-{stable_slug(self.input_path.stem, max_length=28)}"
    self.warnings: list[str] = []
    self.runtime_summary = self._load_runtime_summary()

  def run(self) -> dict:
    file_type = detect_file_type(str(self.input_path))
    self._ensure_not_cancelled()
    self._stage("ingest", "Source accepted", f"Loaded {self.input_path.name}")
    self._stats({"fileType": file_type, "currentStage": "ingest"})
    self.emitter.log("info", "File loaded", str(self.input_path))
    self.emitter.log("info", "Detected input type", file_type)
    self._progress("ingest", 1.0)

    document = self._extract_document(file_type)
    if not document.text.strip():
      raise RuntimeError(
        "No text could be extracted. OCR fallback is not implemented yet for scanned sources."
      )

    for warning in document.warnings:
      self._warn(warning)

    chapters = self._detect_chapters(document)
    chunks = self._create_chunks(chapters)
    final_audio_files = self._generate_audio(chapters, chunks)

    self._stage("finalize", "Writing output", "Saving manifest and text assets.")
    self._progress("finalize", 0.4)

    output_payload = write_outputs(
      book_dir=self.book_dir,
      document=document,
      chapters=chapters,
      chunks=chunks,
      final_audio_files=final_audio_files,
      warnings=self.warnings,
      settings=self.settings,
      runtime=self.runtime_summary
    )

    self._progress("finalize", 1.0)
    self._stats({"currentStage": "completed", "elapsedMs": self._elapsed_ms()})

    result = {
      "jobId": self.job_id,
      "outputDir": str(self.book_dir),
      "manifestPath": output_payload["manifestPath"],
      "rawTextPath": output_payload["rawTextPath"],
      "chaptersPath": output_payload["chaptersPath"],
      "chunksPath": output_payload["chunksPath"],
      "coverPath": document.metadata.get("coverPath"),
      "manifest": {
        "title": document.title,
        "sourceFile": self.input_path.name,
        "sourceType": file_type,
        "convertedAt": document.metadata["convertedAt"],
        "coverPath": document.metadata.get("coverPath"),
        "warnings": self.warnings,
        "settings": self.settings,
        "runtime": self.runtime_summary
      },
      "chapters": [
        {
          "id": chapter.id,
          "title": chapter.title,
          "chunkCount": len([chunk for chunk in chunks if chunk.chapter_id == chapter.id]),
          "textLength": len(chapter.text),
          "outputPath": chapter.output_path
        }
        for chapter in chapters
      ],
      "finalAudioFiles": final_audio_files,
      "previewFile": final_audio_files[0] if final_audio_files else None
    }
    self.emitter.emit("result", result)
    return result

  def _extract_document(self, file_type: str) -> ExtractedDocument:
    self._ensure_not_cancelled()
    self._stage("extract", "Text extraction", "Reading source and extracting text.")
    self._progress("extract", 0.15)

    if file_type == "pdf":
      document = extract_pdf(str(self.input_path))
    elif file_type == "epub":
      document = extract_epub(str(self.input_path))
    elif file_type == "txt":
      document = extract_text_file(str(self.input_path))
    else:
      raise RuntimeError(f"Unsupported input type: {file_type}")

    document.metadata["sourceFile"] = self.input_path.name
    document.metadata["convertedAt"] = datetime.now(timezone.utc).isoformat()
    output_dir_name = f"{stable_slug(document.title, max_length=56)}-{self.job_id}"
    self.book_dir = ensure_directory(
      Path(self.settings["outputDir"]) / output_dir_name
    )
    ensure_directory(self.book_dir / "audio")
    ensure_directory(self.book_dir / "final")
    if self.settings["keepTempFiles"]:
      ensure_directory(self.book_dir / "temp")

    if document.cover_bytes and document.cover_extension:
      cover_path = self.book_dir / f"cover.{document.cover_extension}"
      cover_path.write_bytes(document.cover_bytes)
      document.metadata["coverPath"] = str(cover_path)
      self.emitter.log("info", "Copertina estratta", str(cover_path))

    self._progress("extract", 1.0)
    self._stats(
      {
        "fileType": file_type,
        "ocrUsed": document.ocr_used,
        "currentStage": "extract",
        "elapsedMs": self._elapsed_ms()
      }
    )
    self.emitter.log(
      "info",
      "Text extracted",
      f"{len(document.text)} characters from {file_type.upper()} source"
    )
    return document

  def _detect_chapters(self, document: ExtractedDocument) -> list[Chapter]:
    self._ensure_not_cancelled()
    self._stage(
      "chaptering",
      "Chapter detection",
      "Trying TOC, then visible headings, then smart fallback sections."
    )

    chapters = detect_from_toc(document.text, document.toc, document.toc_marks)
    chapter_mode = "toc"

    if not chapters:
      chapters = detect_from_headings(document.text)
      chapter_mode = "heading"

    if not chapters:
      chapters = fallback_sections(document.text, target_chars=max(6000, self.settings["chunkSize"] * 4))
      chapter_mode = "fallback"

    self._progress("chaptering", 1.0)
    self._stats(
      {
        "chaptersFound": len(chapters),
        "chapterMode": chapter_mode,
        "currentStage": "chaptering",
        "elapsedMs": self._elapsed_ms()
      }
    )
    self.emitter.log("info", "Chapters prepared", f"{len(chapters)} sections using {chapter_mode}")
    return chapters

  def _create_chunks(self, chapters: list[Chapter]) -> list[Chunk]:
    self._ensure_not_cancelled()
    self._stage("chunking", "Chunk planning", "Building readable text segments.")
    effective_chunk_size = self._resolve_effective_chunk_size()
    chunks = chunk_chapters(chapters, effective_chunk_size)
    self._progress("chunking", 1.0)
    self._stats(
      {
        "chunksCreated": len(chunks),
        "currentStage": "chunking",
        "chunkSize": effective_chunk_size,
        "elapsedMs": self._elapsed_ms()
      }
    )
    if effective_chunk_size != int(self.settings["chunkSize"]):
      self._warn(
        f"{self._engine_label()} su CPU sta usando chunk piu corti ({effective_chunk_size} caratteri) per evitare blocchi molto lunghi."
      )
    self.emitter.log("info", "Chunks created", f"{len(chunks)} speech chunks ready for TTS")
    return chunks

  def _generate_audio(self, chapters: list[Chapter], chunks: list[Chunk]) -> list[str]:
    self._ensure_not_cancelled()
    self._stage("tts", "Voice synthesis", "Generating chunk audio with the configured engine.")
    adapter = create_tts_adapter(self.settings)
    audio_dir = ensure_directory(self.book_dir / "audio")
    final_dir = ensure_directory(self.book_dir / "final")
    total_chunks = len(chunks)
    chapter_titles = {chapter.id: chapter.title for chapter in chapters}

    engine_label = self._engine_label()
    workers = adapter.preferred_workers(self.settings) if getattr(adapter, "supports_parallel", False) else 1
    workers = max(1, min(int(workers), total_chunks)) if total_chunks else 1

    if total_chunks:
      first_title = chapter_titles.get(chunks[0].chapter_id, "Capitolo")
      if workers > 1:
        intro = (
          f"Preparing {engine_label} and generating {total_chunks} chunks "
          f"with {workers} parallel workers, starting from '{first_title}'."
        )
      else:
        intro = (
          f"Preparing {engine_label} and generating chunk 1/{total_chunks} "
          f"from '{first_title}'."
        )
      self._stage("tts", "Voice synthesis", intro)

      if workers > 1:
        self._synthesize_parallel(adapter, chunks, audio_dir, workers)
      else:
        self._synthesize_sequential(adapter, chunks, audio_dir, chapter_titles)

    self._stage("merge", "Audio merge", "Organising chapter outputs and final files.")
    grouped_chunks: dict[str, list[Chunk]] = defaultdict(list)
    for chunk in chunks:
      grouped_chunks[chunk.chapter_id].append(chunk)

    final_outputs: list[str] = []

    for index, chapter in enumerate(chapters, start=1):
      self._ensure_not_cancelled()
      chapter_chunks = grouped_chunks[chapter.id]
      if not chapter_chunks:
        continue

      if self.settings["mergeByChapter"]:
        chapter_slug = f"chapter-{index:02d}-{slugify(chapter.title)[:48]}"
        merged_path, merge_warnings = merge_audio_chunks(
          inputs=[Path(item.output_path) for item in chapter_chunks if item.output_path],
          output_dir=final_dir,
          chapter_slug=chapter_slug,
          preferred_format=str(self.settings["preferredAudioFormat"])
        )
        chapter.output_path = str(merged_path)
        final_outputs.append(str(merged_path))
        for warning in merge_warnings:
          self._warn(warning)
      else:
        chapter.output_path = chapter_chunks[0].output_path
        final_outputs.extend(
          [str(item.output_path) for item in chapter_chunks if item.output_path]
        )
        self._warn(
          f"Merge by chapter is disabled, so chapter {index:02d} keeps chunk files as final output."
        )

      self._progress("merge", index / max(1, len(chapters)))

    self._stats({"currentStage": "merge", "elapsedMs": self._elapsed_ms()})
    self.emitter.log("info", "Merge completed", f"{len(final_outputs)} final audio files ready")
    return final_outputs

  def _synthesize_sequential(self, adapter, chunks, audio_dir, chapter_titles) -> None:
    total_chunks = len(chunks)
    for index, chunk in enumerate(chunks, start=1):
      self._ensure_not_cancelled()
      output_path = audio_dir / f"{chunk.id}.wav"
      generated_warnings = adapter.synthesize(chunk.text, output_path, self.settings)
      chunk.output_path = str(output_path)
      for warning in generated_warnings:
        self._warn(warning)
      self._stats(
        {
          "audioChunksGenerated": index,
          "currentStage": "tts",
          "elapsedMs": self._elapsed_ms()
        }
      )
      next_index = index + 1
      if next_index <= total_chunks:
        next_chunk = chunks[next_index - 1]
        next_title = chapter_titles.get(next_chunk.chapter_id, "Capitolo")
        label = (
          f"Chunk {index}/{total_chunks} completed. "
          f"Generating {next_index}/{total_chunks} from '{next_title}'."
        )
      else:
        label = f"Chunk {index}/{total_chunks} completed. Preparing chapter merge."
      self._progress("tts", index / max(1, total_chunks), label)

  def _synthesize_parallel(self, adapter, chunks, audio_dir, workers) -> None:
    total_chunks = len(chunks)

    try:
      adapter.warmup()
    except Exception as warmup_error:  # pragma: no cover - best effort cache priming
      self.emitter.log("info", "TTS warmup skipped", str(warmup_error))

    def work(chunk):
      output_path = audio_dir / f"{chunk.id}.wav"
      warnings = adapter.synthesize(chunk.text, output_path, self.settings)
      chunk.output_path = str(output_path)
      return warnings

    completed = 0
    with ThreadPoolExecutor(max_workers=workers) as executor:
      futures = {}
      for chunk in chunks:
        if self.is_cancelled():
          break
        futures[executor.submit(work, chunk)] = chunk

      for future in as_completed(futures):
        warnings = future.result()
        for warning in warnings:
          self._warn(warning)
        completed += 1
        self._stats(
          {
            "audioChunksGenerated": completed,
            "currentStage": "tts",
            "elapsedMs": self._elapsed_ms()
          }
        )
        remaining = total_chunks - completed
        if remaining > 0:
          label = (
            f"{completed}/{total_chunks} chunk completati "
            f"({workers} in parallelo). Mancano {remaining}."
          )
        else:
          label = f"{completed}/{total_chunks} chunk completati. Preparing chapter merge."
        self._progress("tts", completed / max(1, total_chunks), label)

        if self.is_cancelled():
          for pending in futures:
            pending.cancel()
          break

    self._ensure_not_cancelled()

  def _engine_label(self) -> str:
    engine = str(self.settings["tts"].get("engine", "supertonic") or "supertonic").strip().lower()
    return {
      "supertonic": "Supertonic",
      "qwen": "Qwen",
      "placeholder": "Placeholder"
    }.get(engine, engine)

  def _warn(self, message: str) -> None:
    if message in self.warnings:
      return
    self.warnings.append(message)
    self.emitter.warning(message)

  def _stage(self, stage: str, label: str, message: str) -> None:
    self.emitter.stage(stage, label, message)

  def _progress(self, stage: str, local_progress: float, label: str | None = None) -> None:
    start, end = PROGRESS_ANCHORS[stage]
    overall = start + ((end - start) * local_progress)
    self.emitter.progress(stage, overall, label)

  def _elapsed_ms(self) -> int:
    return int((time.monotonic() - self.started_at) * 1000)

  def _stats(self, payload: dict) -> None:
    payload.setdefault("elapsedMs", self._elapsed_ms())
    self.emitter.stats(payload)

  def _load_runtime_summary(self) -> dict:
    engine = str(self.settings["tts"].get("engine", "qwen") or "qwen").strip().lower()

    raw = os.getenv("GRILLO_RUNTIME_INFO_JSON", "").strip()
    if not raw:
      return {
        "runtimeId": "qwen-dev-fallback",
        "runtimeVersion": "dev",
        "mode": "development",
        "source": "environment"
      }

    try:
      parsed = json.loads(raw)
    except json.JSONDecodeError:
      return {
        "runtimeId": "qwen-runtime-invalid",
        "runtimeVersion": "unknown",
        "mode": "development",
        "source": "environment"
      }

    summary = {
      "runtimeId": parsed.get("runtimeId", "qwen-managed"),
      "runtimeVersion": parsed.get("runtimeVersion", "unknown"),
      "mode": parsed.get("mode", "development"),
      "source": parsed.get("source", "environment")
    }

    if parsed.get("revision"):
      summary["revision"] = parsed["revision"]

    if parsed.get("pythonPath"):
      summary["pythonPath"] = parsed["pythonPath"]

    return summary

  def _ensure_not_cancelled(self) -> None:
    if self.is_cancelled():
      raise JobCancelled("Cancellation requested.")

  def _resolve_effective_chunk_size(self) -> int:
    configured = max(120, int(self.settings["chunkSize"]))
    engine = str(self.settings["tts"].get("engine", "qwen") or "qwen").strip().lower()
    device = (os.getenv("GRILLO_QWEN_DEVICE", "").strip().lower() or "cpu")

    if engine == "qwen" and device == "cpu":
      return min(configured, 1200)

    return configured
