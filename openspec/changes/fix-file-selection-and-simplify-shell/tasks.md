## 1. Reliable File Input

- [x] 1.1 Replace the current fragile picker path with a file-selection flow that reliably opens from `Scegli file`
- [x] 1.2 Ensure drag-and-drop accepts supported local files and maps them into the same normalized file state
- [x] 1.3 Verify manual selection and drag-and-drop both work for `PDF`, `EPUB`, `TXT`, and `MD`

## 2. Upload-Centered Action Layout

- [x] 2.1 Move `Scegli file`, `Converti`, and `Pulisci` into one compact action row tied to the upload section
- [x] 2.2 Remove duplicate or competing top-right action buttons from the shell header
- [x] 2.3 Keep the shell on one screen with the upload area remaining the dominant entry point

## 3. Settings And Messages Simplification

- [x] 3.1 Replace the current large settings trigger with a smaller bordered icon-only button
- [x] 3.2 Remove the always-visible log panel and replace it with compact user-facing messages for status, warnings, and errors
- [x] 3.3 Add a `show detailed logs` checkbox inside settings with default value `false`

## 4. Validation

- [x] 4.1 Verify that the app no longer opens extra development windows unnecessarily during normal iteration
- [x] 4.2 Verify that upload, convert, cancel, open output, and result rendering still work after the shell simplification
- [x] 4.3 Review the final layout against the attached references to ensure the visible UI is minimal and consistent
