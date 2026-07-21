## Context

The current desktop app packages the backend source but still resolves Python from `GRILLO_PYTHON_PATH`, `backend/.venv`, or a system `python3`, and the LuxTTS adapter assumes an external `luxtts` shell command already exists. That is workable for local development, but it fails for packaged installs because upstream LuxTTS is distributed as a Python project and model-loading flow rather than as a preinstalled macOS CLI. The upstream repository documents local setup through `pip install -r requirements.txt`, direct Python imports from `zipvoice.luxvoice`, and runtime loading from Hugging Face, which means a user-friendly desktop distribution must manage Python, Python packages, and model assets on the user's behalf.

## Goals / Non-Goals

**Goals:**
- Let packaged macOS users install the app and prepare a working LuxTTS runtime without opening Terminal.
- Remove the product's dependency on a user-managed system Python or ad hoc `luxtts` executable.
- Keep LuxTTS integration deterministic by pinning a known upstream source revision and validating runtime health before conversion starts.
- Surface runtime readiness, install progress, repair, and failure states clearly in the desktop UI.
- Preserve the current development-safe placeholder fallback for local contributors who do not yet have the managed runtime installed.

**Non-Goals:**
- Guarantee a fully offline installer in the first iteration if that would make the app bundle unacceptably large.
- Support Windows or Linux packaging in this change.
- Solve every future TTS engine packaging concern; this design focuses on LuxTTS as the first managed runtime.
- Rework chaptering, output formats, or unrelated conversion UX.

## Decisions

### Store LuxTTS in an app-managed runtime directory under macOS user data

The packaged app will install and maintain a private runtime under an app-managed directory such as `~/Library/Application Support/<app>/runtimes/luxtts/<version>-<arch>/`. That directory will contain installation metadata, the managed Python environment, cached model artifacts, logs, and a health-status manifest.

Why:
- avoids mutating global Python environments
- keeps upgrades, repair, and cleanup under app control
- allows versioned side-by-side installs during upgrades

Alternative considered:
- Rely on system Python and a user-installed LuxTTS CLI. Rejected because it recreates the current onboarding failure for non-technical users.

### Use a two-stage runtime bootstrap instead of assuming LuxTTS is fully bundled in the `.app`

The desktop installer will ship a minimal bootstrap runtime and install manifest, while the app will complete LuxTTS setup on first run or explicit install action. The bootstrap will prepare the Python environment and install pinned LuxTTS dependencies into the managed runtime. Model assets may be downloaded during setup or first use unless a later release decides to bundle them.

Why:
- keeps the user out of Terminal while staying compatible with upstream LuxTTS packaging
- avoids forcing the first implementation to embed every large dependency and model artifact directly in the signed app bundle
- makes repair and incremental runtime updates possible without replacing the whole app

Alternative considered:
- Fully bundle Python, dependencies, and model weights inside the app bundle. Rejected for the first iteration because installer size, code-signing complexity, and architecture-specific binary payloads would grow significantly.

### Replace shell-based LuxTTS invocation with a direct Python adapter

The backend TTS adapter will import and call LuxTTS through Python instead of spawning a `luxtts` command. The managed backend runtime will own those imports, and the adapter will expose a thin wrapper around prompt encoding, speech generation, and file writing using the upstream API.

Why:
- matches the upstream repository's documented integration path
- removes a fragile CLI contract that does not actually exist in the referenced repository
- keeps error handling and performance control inside the backend process

Alternative considered:
- Create and maintain a custom wrapper CLI around LuxTTS. Rejected because it adds one more contract to own without reducing the packaging burden.

### Add runtime readiness and installation progress to the Electron API

Electron main will own runtime installation and health checks, expose status and control APIs through preload, and stream install progress events to the renderer. The renderer will block packaged conversions when the managed LuxTTS runtime is missing or unhealthy, and it will offer install, retry, repair, and diagnostics actions.

Why:
- gives the user actionable setup feedback instead of a generic fallback warning
- keeps installation privileges and filesystem writes in the trusted desktop layer
- makes runtime state inspectable before conversion begins

Alternative considered:
- Attempt installation lazily only when `Convert` is clicked and surface any failure as a job error. Rejected because it blurs setup and conversion concerns and would feel unreliable.

### Build and release separate macOS runtime assets per architecture

The release process will prepare architecture-specific runtime manifests and installation assets for `arm64` and `x64` macOS builds. Runtime validation will check both app version compatibility and CPU architecture before marking LuxTTS as ready.

Why:
- upstream Python dependencies such as `torch` and `torchaudio` are architecture-sensitive
- keeps runtime resolution deterministic on Apple Silicon and Intel Macs
- reduces the chance of silent incompatibility after app updates

Alternative considered:
- One universal runtime layout for all Macs. Rejected because Python wheels and acceleration support are not uniformly interchangeable across architectures.

## Risks / Trade-offs

- [Initial runtime setup may be large or slow] -> Show progress stages, keep setup separate from conversion, and support resume/repair instead of restarting blindly.
- [Upstream LuxTTS or transitive dependencies may change incompatibly] -> Pin an upstream commit or package version and validate install health with a smoke test before marking the runtime ready.
- [Model downloads may fail or require network access] -> Surface this explicitly in setup UI, cache artifacts in the managed runtime, and document offline limitations clearly.
- [macOS code signing and notarization can become harder with embedded runtimes] -> Keep mutable runtime files out of the signed app bundle and install them into user data after app launch.
- [Development workflow could become slower] -> Preserve the existing placeholder fallback path in development when managed runtime installation is intentionally skipped.

## Migration Plan

1. Add a desktop runtime manager that resolves install paths, version metadata, health state, and arch compatibility.
2. Create a bootstrap/install script that prepares a managed Python environment and installs pinned LuxTTS dependencies for the current architecture.
3. Replace the current LuxTTS CLI adapter with a direct Python integration aligned to the managed runtime.
4. Add Electron IPC and renderer states for runtime status, install progress, retry, repair, and conversion blocking.
5. Update packaging to include bootstrap assets and produce architecture-specific release metadata.
6. Validate first-run installation, upgrade, repair, and uninstall/reinstall flows on supported macOS builds.

Rollback strategy:
- Keep the existing placeholder fallback available in development, and gate the packaged runtime flow behind the new runtime manager so the managed-install path can be disabled if release validation fails.

## Open Questions

- Should the first shipped version download LuxTTS model artifacts on first run, or should we accept a larger installer and bundle them?
- Do we want to preserve an advanced override for developers to point the app at an external LuxTTS environment?
- Which exact upstream LuxTTS commit or package revision should we pin for repeatable releases?
