## Why

There is a clear opportunity to build a macOS-first desktop tool that turns PDF and ebook files into organized audiobook outputs entirely on the local machine, without depending on a remote backend. This is needed now because the product value depends equally on execution quality, pipeline transparency, and a strong editorial interface rather than on a mock demo.

## What Changes

- Create a real Electron desktop shell with React, Tailwind CSS, TypeScript, and a custom editorial design system.
- Add a local Python conversion pipeline for file detection, text extraction, chapter detection, chunking, TTS execution, audio merge, and manifest writing.
- Connect Electron and Python through a structured subprocess protocol with progress, stats, logs, warnings, results, and cancellation support.
- Support local import of PDF, EPUB, and simple text-based ebook files with a clear path to add OCR later for scanned PDFs.
- Generate structured outputs for each book, including raw text, chapter metadata, chunk metadata, intermediate chunk audio, final chapter audio, and a manifest.
- Expose TTS configuration in the UI, including voice mode, language, speed, preferred audio format, merge strategy, and optional reference audio path for future authorized voice workflows.
- Provide polished home, processing, result, empty, and error states that keep the user informed without exposing unnecessary technical complexity.

## Capabilities

### New Capabilities
- `desktop-conversion-workflow`: Desktop UI flows for file selection, drag and drop, conversion launch, processing feedback, result review, and retry paths.
- `local-document-conversion-pipeline`: Local parsing and conversion pipeline for PDF, EPUB, and text files, including chapter detection, chunking, and output generation.
- `local-tts-and-audio-postprocessing`: Pluggable local TTS execution with LuxTTS as the initial engine, chunk-level progress, and ffmpeg-based audio merge with safe fallbacks.
- `job-progress-and-results-reporting`: Structured event protocol between Electron and Python for progress, logs, stats, warnings, cancellation, and final result delivery.

### Modified Capabilities

None.

## Impact

- Affected frontend areas: Electron main/preload, React renderer, Tailwind styling, state handling, audio preview, and file-system actions.
- Affected backend areas: Python package structure, extractor modules, chaptering logic, chunking logic, TTS adapter layer, ffmpeg integration, output writers, and CLI orchestration.
- New dependencies: Electron, React, Vite, Tailwind, lucide-react, Python parsing libraries, LuxTTS integration point, and ffmpeg runtime dependency.
- Operational impact: local-only execution on macOS, no mandatory cloud API, and explicit documentation for Python environment setup and media tooling.
