# Release Notes

## Managed XTTS Runtime

- Added a guided first-run `Motore voce` flow for the desktop app.
- Packaged builds now gate conversion until the managed XTTS runtime is installed or repaired.
- The app can install, repair, and remove the XTTS runtime from an app-managed directory under `~/Library/Application Support/Grillo parlante/`.
- Local development still supports a placeholder-audio fallback when XTTS is intentionally not installed.
- The backend now integrates XTTS through Python imports with automatic Italian/English language selection.
