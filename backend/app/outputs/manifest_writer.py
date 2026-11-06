from __future__ import annotations

import json
from pathlib import Path

from app.jobs.models import Chapter, Chunk, ExtractedDocument


def write_outputs(
  book_dir: Path,
  document: ExtractedDocument,
  chapters: list[Chapter],
  chunks: list[Chunk],
  final_audio_files: list[str],
  warnings: list[str],
  settings: dict,
  runtime: dict | None = None
) -> dict[str, str]:
  raw_text_path = book_dir / "raw_text.txt"
  chapters_path = book_dir / "chapters.json"
  chunks_path = book_dir / "chunks.json"
  manifest_path = book_dir / "manifest.json"

  raw_text_path.write_text(document.text, encoding="utf-8")
  chapters_path.write_text(
    json.dumps(
      [
        {
          "id": chapter.id,
          "title": chapter.title,
          "source": chapter.source,
          "outputPath": chapter.output_path
        }
        for chapter in chapters
      ],
      ensure_ascii=False,
      indent=2
    ),
    encoding="utf-8"
  )
  chunks_path.write_text(
    json.dumps(
      [
        {
          "id": chunk.id,
          "chapterId": chunk.chapter_id,
          "index": chunk.index,
          "textLength": len(chunk.text),
          "outputPath": chunk.output_path
        }
        for chunk in chunks
      ],
      ensure_ascii=False,
      indent=2
    ),
    encoding="utf-8"
  )

  manifest = {
    "title": document.title,
    "sourceFile": document.metadata.get("sourceFile", ""),
    "sourceType": document.file_type,
    "convertedAt": document.metadata.get("convertedAt", ""),
    "coverPath": document.metadata.get("coverPath", ""),
    "chapterCount": len(chapters),
    "chapters": [
      {
        "id": chapter.id,
        "title": chapter.title,
        "outputPath": chapter.output_path
      }
      for chapter in chapters
    ],
    "finalAudioFiles": final_audio_files,
    "warnings": warnings,
    "settings": settings,
    "runtime": runtime or {}
  }
  manifest_path.write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2),
    encoding="utf-8"
  )

  return {
    "manifestPath": str(manifest_path),
    "rawTextPath": str(raw_text_path),
    "chaptersPath": str(chapters_path),
    "chunksPath": str(chunks_path),
    "coverPath": document.metadata.get("coverPath", "")
  }
