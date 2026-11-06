## 1. Project Scaffold

- [x] 1.1 Create the macOS-first project structure for Electron, React, Tailwind, TypeScript, shared contracts, backend Python modules, docs, and scripts
- [x] 1.2 Add desktop, renderer, and build dependencies plus base TypeScript, Vite, Tailwind, and packaging configuration
- [x] 1.3 Add backend requirements, bootstrap scripts, and repository ignores for local environments and generated outputs

## 2. Desktop Workflow

- [x] 2.1 Implement the Electron main process, preload bridge, and secure renderer API for file selection, job start, cancel, and output-folder actions
- [x] 2.2 Build the React home view with drag and drop, file picker, session recents, and conversion settings controls
- [x] 2.3 Build the processing, result, empty, and error views with strong editorial styling and clear job-state transitions

## 3. Local Conversion Pipeline

- [x] 3.1 Implement file detection and text extraction modules for PDF, EPUB, and simple text inputs
- [x] 3.2 Implement chapter detection using TOC matching, heading heuristics, and fallback section generation
- [x] 3.3 Implement chunking logic that preserves readable boundaries and writes chunk metadata

## 4. TTS And Audio Processing

- [x] 4.1 Implement the pluggable TTS adapter interface with LuxTTS as the initial engine and a safe development fallback
- [x] 4.2 Implement chunk-level audio generation, progress reporting, and temporary file handling
- [x] 4.3 Implement ffmpeg-based chapter merge with a documented fallback when ffmpeg is unavailable

## 5. Reporting And Output Packaging

- [x] 5.1 Define the structured JSON-lines job event protocol shared by Python and Electron
- [x] 5.2 Implement manifest, chapters, chunks, raw text, and final output writing in book-specific directories
- [x] 5.3 Surface live logs, warnings, stage badges, stats, and in-memory result history in the desktop UI

## 6. Documentation And Validation

- [x] 6.1 Write README instructions for macOS setup, ffmpeg installation, LuxTTS integration, local development, and desktop build
- [x] 6.2 Add architecture and design-system documentation plus sample manifest and example input data
- [x] 6.3 Validate the backend pipeline on local sample content and confirm the OpenSpec change is ready for implementation
