## 1. Floating settings trigger and popover shell

- [x] 1.1 Remove the settings icon button from `Dropzone` and its `isSettingsOpen` / `onToggleSettings` props if no longer needed there.
- [x] 1.2 Add a fixed bottom-right settings trigger in `App` (or a small dedicated component) with appropriate z-index and safe padding.
- [x] 1.3 Move the settings panel markup out of the main column into a popover layer (portal or fixed positioning), anchored to the trigger; keep click-outside and Escape dismissal using refs.
- [x] 1.4 Adjust CSS so the main column no longer reserves space for inline settings; verify scroll behavior matches `floating-settings-popover` spec.

## 2. DevTools IPC and detailed logs toggle

- [x] 2.1 Add `ipcMain` handler and `preload` exposure for `openDevTools` (or equivalent), calling `webContents.openDevTools` with the same mode as existing dev shortcuts; gate with `!app.isPackaged` if required by project policy.
- [x] 2.2 Extend `window.d.ts` for the new `grillo` API method.
- [x] 2.3 When `showDetailedLogs` becomes `true`, invoke the new API so DevTools open in Electron; no-op safely when the bridge is absent (browser dev).

## 3. Verification

- [x] 3.1 Manually verify: open/close popover from bottom-right control; layout does not jump; Escape and outside click close the popover.
- [x] 3.2 Manually verify: enabling «Mostra log dettagliati» opens DevTools; verbose log area still behaves as before.
