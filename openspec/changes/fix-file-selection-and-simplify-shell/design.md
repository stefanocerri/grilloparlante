## Context

The app is already structured as a local Electron shell around a Python conversion pipeline, but the current shell still fails at the most important user action: selecting a file from the Mac. On top of that, the interface still carries more persistent UI than the user wants. The attached screenshots make the desired direction very clear: keep the upload section dominant, keep the main actions close to it, hide technical noise by default, and expose settings only when the user asks for them.

This change should improve functional reliability first and reduce UI noise second.

## Goals / Non-Goals

**Goals:**
- Make `Scegli file` reliably open a local macOS-compatible selector.
- Preserve drag-and-drop as a first-class upload path.
- Keep the shell on one screen with the minimum indispensable controls visible.
- Place the main action buttons next to the upload area in a compact row.
- Replace the permanent log block with toast-like status messages and optional detailed logs.
- Hide detailed logs by default behind a setting.
- Reduce the settings entry point to a small bordered icon button.

**Non-Goals:**
- Rebuild the backend job protocol.
- Add a multi-page navigation system.
- Add new pipeline features unrelated to upload reliability or shell simplification.
- Reintroduce decorative accent blocks or extra dashboard panels.

## Decisions

### Use a renderer-owned file input as the primary selection path

Manual selection will be driven by a real file input in the renderer, while Electron helpers may still enrich metadata if needed.

Why:
- avoids fragile dialog behavior tied to window parenting or restart timing
- aligns with browser/Electron gesture requirements for opening a native picker
- keeps the click path close to the UI component that owns the upload state

Alternative considered:
- continue to rely primarily on `dialog.showOpenDialog` via IPC. Rejected because the current failure mode blocks the main action and is harder to reason about from the UI layer.

### Keep drag-and-drop equal to manual selection

The upload surface will accept drop events for supported file types and produce the same file metadata state as the manual picker.

Why:
- matches the requested workflow
- preserves a fast desktop interaction style
- avoids forcing users through only one input method

Alternative considered:
- keep only manual selection until the picker bug is solved. Rejected because both affordances are required.

### Move the action cluster into the upload section

`Scegli file`, `Converti`, and `Pulisci` will live together in a compact horizontal action strip visually tied to the file area.

Why:
- matches the reference screenshots
- removes the split between top-level actions and upload actions
- reduces scanning cost on a one-screen layout

Alternative considered:
- keep utility actions in the header. Rejected because it makes the interaction flow feel fragmented.

### Replace the permanent log panel with lightweight messages

The shell will show warnings, errors, and progress notes as compact inline messages or toast-like feedback, while the verbose log console becomes optional and hidden by default.

Why:
- the permanent log column is visually heavy and not useful for most first-run users
- the user explicitly asked to remove it from the default screen
- detailed logs are still useful for debugging, just not as always-on chrome

Alternative considered:
- keep logs visible but collapsed. Rejected because even the collapsed block still occupies attention and signals unnecessary complexity.

### Make settings secondary

The settings entry point will be a small bordered icon button rather than a large labeled callout. A new checkbox inside settings will control whether the detailed log console is shown, with default value `false`.

Why:
- keeps the shell focused on upload and conversion
- follows the requested visual hierarchy
- gives a recovery/debug path without making it the main story

Alternative considered:
- remove detailed logs entirely. Rejected because they are still valuable during development and troubleshooting.

## Risks / Trade-offs

- [Renderer file input returns incomplete metadata in some cases] -> Normalize all selected files through shared file-meta helpers and keep supported types narrow.
- [Hiding logs makes debugging harder] -> Add a clear checkbox in settings and keep critical warnings/errors visible inline even when verbose logs are hidden.
- [Grouping all actions near upload makes the top of the screen denser] -> Keep the cluster compact and let settings remain secondary.
- [Drag-and-drop behavior differs from picker behavior] -> Route both paths through the same file-normalization logic and accepted-extension rules.

## Migration Plan

1. Define new requirements for reliable local file selection and minimal shell behavior.
2. Replace the current picker wiring with a renderer-driven selection flow that reliably opens from a user click.
3. Update the upload section to support both drag-and-drop and manual selection with the same state handling.
4. Move `Scegli file`, `Converti`, and `Pulisci` into one compact action row near the upload block.
5. Remove the permanent log column and replace it with inline/toast feedback plus optional detailed logs in settings.
6. Reduce the settings trigger to a small bordered icon button and add `show detailed logs` as a default-off setting.

Rollback strategy:
- If needed, revert the renderer upload component and shell layout without touching the backend conversion flow.

## Open Questions

- Should the optional detailed log area appear inline below the status block or inside the settings drawer itself when enabled?
- When the user enables verbose logs, should that preference persist across launches or remain session-only for now?
