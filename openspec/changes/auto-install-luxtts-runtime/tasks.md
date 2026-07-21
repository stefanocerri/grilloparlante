## 1. Runtime Foundation

- [x] 1.1 Define the managed LuxTTS runtime layout, version metadata, and health-check contract under the macOS app-managed data directory
- [x] 1.2 Implement an Electron-side runtime manager that resolves install paths, validates architecture compatibility, and reports readiness state
- [x] 1.3 Add shared desktop contracts plus preload and IPC APIs for runtime status, install start, progress events, retry, and repair

## 2. Managed Installation Flow

- [x] 2.1 Create a bootstrap installer that prepares the private Python environment and installs pinned LuxTTS dependencies for the current macOS architecture
- [x] 2.2 Update Electron packaging and release assets so packaged builds ship the bootstrap resources required for managed LuxTTS setup
- [x] 2.3 Build renderer setup states for runtime readiness, install progress, blocked conversion, failure diagnostics, and repair actions

## 3. LuxTTS Backend Integration

- [x] 3.1 Replace the current external `luxtts` CLI assumption with a direct LuxTTS Python adapter running inside the managed runtime
- [x] 3.2 Update backend job flow and manifest output to record runtime provenance, setup warnings, and packaged-runtime failure details
- [x] 3.3 Preserve the development-safe placeholder fallback path when managed runtime installation is intentionally skipped in local development

## 4. Verification and Rollout

- [ ] 4.1 Validate first-run install, reinstall, repair, and conversion flows on packaged macOS builds for each supported architecture
- [x] 4.2 Document managed LuxTTS setup behavior, download assumptions, and developer overrides in the README and release notes
