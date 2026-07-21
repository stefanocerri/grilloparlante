## Why

The current visual direction misses the intended product tone: it reads as a soft dashboard instead of a sharp editorial desktop tool. This redesign is needed now because the UI is central to the product identity, and the current look actively weakens the perceived value of the app.

## What Changes

- **BREAKING** Replace the current visual language with a new editorial/brutalist system inspired by the attached references, using Helvetica-based typography and a much harder grid.
- Remove the current warm gradient, soft panels, shadow-heavy surfaces, and generic dashboard composition.
- Rebuild the home/upload experience around oversized black typography, strong horizontal rules, flat color fields, and a more magazine-like layout.
- Rebuild processing and result screens so progress, logs, stats, and chapter outputs feel like an editorial program sheet rather than a SaaS control panel.
- Introduce a reduced palette built around black, off-white, signal orange/red, and one electric accent block, used sparingly and intentionally.
- Keep the existing local pipeline logic, Electron/Python wiring, and feature set unless needed to support the new layout.

## Capabilities

### New Capabilities
- `helvetica-editorial-design-system`: New typography, palette, spacing, border treatment, and composition rules based on Helvetica and hard editorial layouts.
- `editorial-home-upload-experience`: New home/dropzone composition with oversized headlines, flat color blocks, stronger CTA hierarchy, and zero generic card styling.
- `editorial-processing-and-results-layout`: New processing/result/error layouts with denser information design, row-based chapter listings, and reference-aligned visual rhythm.

### Modified Capabilities

None.

## Impact

- Affected code: renderer layout components, CSS tokens, shared visual primitives, and screen compositions in the React frontend.
- Unaffected core logic: Python conversion pipeline, event protocol, output writing, and local execution architecture.
- Design impact: font stack changes to Helvetica-based system, palette reset, spacing recalibration, and removal of the existing soft shell treatment.
- UX impact: clearer upload affordance, stronger visual hierarchy, and a more opinionated art-direction-first interface.
