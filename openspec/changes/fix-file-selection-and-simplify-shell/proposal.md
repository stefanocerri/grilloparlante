## Why

The current desktop shell still has two blocking UX problems. First, the `Scegli file` action is not reliably opening the macOS file picker, which breaks the main entry point of the app. Second, the interface still exposes too much chrome at once: the action buttons are visually scattered, the log area takes permanent space, and the settings trigger is more prominent than it should be.

This change is needed to make the app usable again as a local desktop tool and to simplify the single-screen workflow around the minimum indispensable actions.

## What Changes

- **BREAKING** Rework file selection so the app reliably supports both manual file picking from macOS and drag-and-drop onto the upload surface.
- Move the primary action cluster so `Scegli file`, `Converti`, and `Pulisci` sit together near the upload area instead of being split across the shell.
- Replace the always-visible log panel with lighter message feedback and optional detailed logs.
- Reduce the settings trigger to a bordered icon button and move verbose log visibility into settings behind a checkbox.
- Keep the UI on a single screen and preserve the existing conversion pipeline, result handling, and local-only architecture.

## Capabilities

### New Capabilities
- `reliable-local-file-selection`: Manual file selection and drag-and-drop both work consistently for local book files on macOS.
- `minimal-upload-action-cluster`: Core actions are grouped beside the upload section in a compact, reference-aligned row.
- `optional-debug-log-visibility`: Detailed logs are hidden by default and only shown when explicitly enabled from settings.
- `reduced-single-screen-shell`: The shell removes non-essential always-on panels while keeping progress, warnings, and result actions clear.

### Modified Capabilities

- `editorial-home-upload-experience`: Adjusted to prioritize direct upload usability over decorative composition.
- `editorial-processing-and-results-layout`: Adjusted to use compact inline messages instead of a dedicated permanent log column.

## Impact

- Affected code: Electron preload and window behavior, upload UI components, settings panel, status/message rendering, and shell layout CSS.
- Unaffected core logic: Python extraction, chaptering, chunking, TTS orchestration, ffmpeg merge flow, and output writing.
- UX impact: simpler first-run screen, clearer upload entry point, fewer always-visible panels, and less visual clutter.
