## Context

The product is a macOS-first desktop application that converts user-provided PDF and ebook files into organized audio outputs without requiring a remote backend. The implementation must feel like a serious creative tool, not an engineering prototype, so design quality and feedback clarity are first-class concerns alongside the pipeline itself. The current repository already favors a split between a desktop renderer and a local Python backend, which matches the requested architecture and keeps future OCR, TTS, and packaging extensions tractable.

## Goals / Non-Goals

**Goals:**
- Deliver a real end-to-end local conversion flow from desktop UI to final output artifacts.
- Keep the backend modular so extractors, chaptering, TTS engines, and OCR fallback can evolve independently.
- Use a simple and reliable Electron-to-Python communication model that is easy to debug on macOS.
- Provide live, user-facing feedback for progress, warnings, logs, current stage, and final results.
- Establish a custom editorial design system that feels bold, minimal, and distinct from generic admin dashboards.
- Preserve ethical defaults in voice handling by centering neutral synthetic narration and treating reference audio as an optional future-authorized mode.

**Non-Goals:**
- Implement OCR in the initial MVP.
- Package LuxTTS or Python into a fully self-contained signed production app bundle in this change.
- Build cloud sync, remote job orchestration, or multi-user collaboration.
- Optimize for Windows or Linux-specific distribution constraints in the first iteration.

## Decisions

### Use `subprocess + structured stdout` for Electron-to-Python communication

The desktop process will spawn the Python backend only when a conversion begins. The Python process will emit JSON lines for `stage`, `progress`, `stats`, `log`, `warning`, `result`, `error`, and `cancelled` events.

Why this over a local FastAPI server:
- lower operational complexity
- no resident background service
- simpler cancellation semantics
- easier packaging and local debugging
- natural fit for one-job-at-a-time MVP flow

Alternative considered:
- FastAPI server with HTTP + SSE/WebSocket. Rejected because it introduces lifecycle, port, and reconnection complexity without solving a real MVP bottleneck.

### Use a modular Python package split by conversion responsibility

The backend will use dedicated modules for:
- file detection
- PDF and EPUB extraction
- chapter detection from TOC and visible headings
- fallback sectioning
- chunking
- TTS execution
- ffmpeg merge
- manifest and output writing
- job orchestration

Why:
- clean extension points for OCR and alternate TTS engines
- simpler testing by module
- reduced risk of a monolithic job file becoming hard to evolve

Alternative considered:
- a single pipeline script. Rejected because it would be faster initially but would make OCR, alternate TTS backends, and chaptering heuristics significantly harder to evolve.

### Make LuxTTS pluggable and keep a safe executable fallback path

LuxTTS will be the first adapter, but the TTS layer will depend on a generic adapter interface. If LuxTTS is unavailable or fails, the system will emit a clear warning and can fall back to placeholder audio in development contexts so the full pipeline remains executable.

Why:
- preserves delivery momentum before the exact LuxTTS runtime is finalized
- avoids hard-coding product architecture around one engine
- supports future language and voice-quality experimentation

Alternative considered:
- block the whole pipeline until LuxTTS is fully installed. Rejected because it makes development and onboarding fragile.

### Use chapter-scoped output directories with manifest-first organization

Each job will write:
- `manifest.json`
- `raw_text.txt`
- `chapters.json`
- `chunks.json`
- `audio/` for chunk outputs
- `final/` for chapter outputs

Why:
- easy debugging and reproducibility
- clear handoff between extraction and synthesis layers
- explicit data for future resume/retry flows

Alternative considered:
- output only final audio. Rejected because it hides pipeline state and weakens debuggability.

### Treat the desktop UI as an editorial dashboard, not a utilitarian control panel

The renderer will use a small custom design system with a reduced palette, oversized typography, thin borders, strong accent usage, and clear layout blocks for state, stats, and logs.

Why:
- matches product positioning
- improves legibility of state-heavy screens
- distinguishes the tool from generic developer-facing dashboards

Alternative considered:
- standard Tailwind component defaults. Rejected because they would conflict directly with the requested visual direction.

## Risks / Trade-offs

- [LuxTTS CLI mismatch across environments] -> Keep the adapter pluggable and document the integration point so the invocation contract can be adjusted without touching the rest of the pipeline.
- [PDF chapter detection is imperfect on real-world documents] -> Prefer TOC first, then heading heuristics, then explicit fallback sections, and surface the chosen mode in the UI.
- [No OCR in MVP means some scanned PDFs fail] -> Emit a clear warning and keep extractor boundaries ready for a future OCR module.
- [macOS packaging with Python runtime may become complex] -> Keep local development first, document runtime assumptions, and defer full bundling hardening to a later packaging-focused change.
- [Pseudo-real progress can feel misleading] -> Base progress on actual stage boundaries and chunk counts, and keep logs visible so users understand what is happening.

## Migration Plan

1. Create the OpenSpec artifacts for the local audiobook generator change.
2. Scaffold Electron, React, Tailwind, and Python project structure.
3. Implement the subprocess bridge and backend CLI event protocol.
4. Add the modular conversion pipeline and structured output writing.
5. Build the desktop UI views and connect them to live backend events.
6. Validate the flow on macOS with local development dependencies installed.
7. Iterate on LuxTTS-specific adapter details once the exact runtime contract is confirmed.

Rollback strategy:
- The change is additive and can be rolled back by removing the desktop shell, backend package, and change artifacts if necessary.

## Open Questions

- Which exact LuxTTS CLI or Python API contract should be treated as canonical in this repository?
- Should settings persist only in memory for the MVP, or should a local config file be written immediately?
- Do we want a single-job model only, or should the architecture explicitly reserve room for a queued-job view in a near-term follow-up?
