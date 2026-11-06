## Context

The app already has a functioning local desktop foundation, but its current frontend styling leans toward a soft creative dashboard rather than the much harder editorial direction requested by the user. The attached references point to a different visual grammar: Helvetica, large black headlines, thin rules, aggressive cropping, flat fields of orange/red/white/black, and composition that feels closer to an art-directed index or campaign site than a rounded utility app.

This redesign should preserve the product workflow while replacing most of the renderer presentation layer. The UI needs to feel deliberate, graphic, and slightly severe without becoming confusing or inaccessible.

## Goals / Non-Goals

**Goals:**
- Reset the visual system so the app feels closer to the reference boards than to the current dashboard.
- Use a Helvetica-based font stack throughout the product.
- Remove gradients, glassmorphism, soft panels, and card-heavy layout patterns.
- Build a clearer upload-first home screen with bold headline hierarchy and stronger CTA visibility.
- Reframe processing and results into editorial rows, blocks, and rails rather than stacked “cards”.
- Keep the existing functionality and local pipeline behavior intact while changing the presentation layer.

**Non-Goals:**
- Re-architect the Python backend or Electron bridge.
- Introduce animation-heavy interactions or decorative motion systems.
- Add a completely new navigation model or multi-page information architecture beyond what is needed for the redesign.
- Match the reference screenshots literally pixel-for-pixel.

## Decisions

### Use Helvetica as the primary type system

The renderer will use `Helvetica Neue`, `Helvetica`, and `Arial` fallbacks rather than condensed or expressive display fonts.

Why:
- directly matches the user request
- aligns with the editorial/index-like references
- creates a sharper, more neutral visual voice

Alternative considered:
- keep the previous Avenir-based stack. Rejected because it softens the tone and pulls the interface away from the reference style.

### Replace soft surfaces with flat planes and rule-based composition

The redesign will remove most shadows, gradients, rounded panel treatment, and soft translucent surfaces. Layout will rely on flat blocks, thin borders, row dividers, hard spacing, and visual interruptions from high-contrast color bars.

Why:
- closer to the references
- more graphic and memorable
- avoids generic Tailwind-dashboard aesthetics

Alternative considered:
- simply darken the existing theme. Rejected because the problem is compositional, not just chromatic.

### Shift from “panel dashboard” to “editorial board”

Home, processing, and result views will be rebuilt around:
- large typographic headers
- horizontal separators
- row-oriented metadata
- strong asymmetry
- one or two dominant focal areas instead of evenly weighted cards

Why:
- makes upload and progress states feel intentional
- echoes the archive/index energy in the references
- creates stronger visual pacing across desktop screens

Alternative considered:
- preserve current component structure and only reskin classes. Rejected because the current structure itself encourages the wrong look.

### Use a reduced reference-driven palette

Base colors will center on:
- off-white background
- near-black text and rule lines
- signal orange or red for dominant hero bands
- a single electric blue accent block where contrast and emphasis are needed

Why:
- strong visual identity with low complexity
- faithful to the references without becoming chaotic
- easier to keep coherent across all screens

Alternative considered:
- pastel or warm neutral palette. Rejected because it directly conflicts with the desired severity and impact.

### Keep workflow functionality stable during the redesign

The redesign will wrap and reorganize existing state, settings, logs, and result data rather than redefining the underlying behavior.

Why:
- isolates design work from pipeline risk
- speeds up iteration
- preserves already-working local conversion behavior

Alternative considered:
- combine redesign with additional feature work. Rejected to keep scope disciplined.

## Risks / Trade-offs

- [Graphic direction overwhelms usability] -> Keep CTA placement obvious, preserve readable labels, and use contrast carefully around critical actions.
- [Overusing accent colors makes the UI noisy] -> Restrict orange/red/blue to a few dominant zones and keep the rest mostly black/white.
- [Helvetica-only approach can look too plain if not composed well] -> Lean on hierarchy, cropping, spacing, and rule lines rather than trying to force personality through decorative styles.
- [Existing components may resist the new composition] -> Prefer restructuring the screen layouts instead of trying to cosmetically patch every old container.

## Migration Plan

1. Define the new design system tokens and visual rules in OpenSpec.
2. Replace the current renderer shell, font stack, and global CSS foundation.
3. Rebuild the home/upload layout around a new editorial composition.
4. Rebuild processing and result screens using rows, rails, and flat information blocks.
5. Validate that upload, progress, logs, chapter list, and result actions remain functional.

Rollback strategy:
- If needed, the redesign can be reverted by restoring the previous CSS and renderer screen compositions without touching backend logic.

## Open Questions

- Do you want the dominant accent to skew more orange like the first reference or more red/white like the second?
- Should the recent-jobs area stay on the home view, or become a more archive-like list below the main upload headline?
- Do you want a persistent top nav strip, or only a minimal product label and utility actions?
