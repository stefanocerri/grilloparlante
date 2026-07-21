## Why

The current app can only use LuxTTS when a developer has manually installed a compatible runtime outside the product, so end users always fall back to placeholder audio. This change is needed now because the desktop installer must prepare a real voice stack for non-technical users instead of assuming local Python, CLI tools, and model setup already exist.

## What Changes

- Add an app-managed LuxTTS runtime installation flow that prepares the required backend environment for end users without asking them to install LuxTTS manually from Terminal.
- Bundle or bootstrap a dedicated Python runtime for the desktop backend so the packaged app no longer depends on a preconfigured system Python.
- Replace the current LuxTTS CLI assumption with a managed Python integration path aligned with the upstream LuxTTS repository and its model-loading flow.
- Add desktop readiness, install-progress, retry, and repair states so users can see whether the voice runtime is downloading, ready, or failed.
- Extend release packaging to ship the assets and metadata needed for architecture-specific LuxTTS setup on supported macOS builds.

## Capabilities

### New Capabilities
- `managed-luxtts-runtime-installation`: The desktop app installs, validates, repairs, and reuses a LuxTTS runtime under an app-managed location for end users.

### Modified Capabilities
- `desktop-conversion-workflow`: The desktop flow must expose setup readiness, blocked conversion states, install progress, and recovery actions when the voice runtime is missing or unhealthy.
- `local-tts-and-audio-postprocessing`: The TTS layer must use the managed LuxTTS Python runtime instead of assuming an external `luxtts` executable is already available in the local shell environment.

## Impact

- Affected desktop areas: Electron main process, preload API, renderer state and setup UI, packaging config, and release workflow.
- Affected backend areas: Python runtime resolution, TTS adapter implementation, dependency installation scripts, runtime health checks, and model cache management.
- New dependencies: managed Python distribution strategy, upstream LuxTTS Python package and transitive dependencies such as `torch`, `torchaudio`, `onnxruntime`, `vocos`, and Hugging Face model artifacts.
- Operational impact: installer size, first-run setup time, architecture-specific packaging decisions, and possible first-run network/download requirements unless model assets are fully bundled.
