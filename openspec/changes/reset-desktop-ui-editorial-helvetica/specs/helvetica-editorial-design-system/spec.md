## ADDED Requirements

### Requirement: The desktop UI uses a Helvetica-based visual system
The system SHALL use a Helvetica-based font stack for all interface typography, including headers, metadata, controls, logs, and result listings.

#### Scenario: Application loads main screens
- **WHEN** the user opens the desktop app
- **THEN** the renderer SHALL use `Helvetica Neue`, `Helvetica`, or equivalent system Helvetica fallbacks rather than the previous display stack

### Requirement: The desktop UI uses a flat editorial palette and hard layout grammar
The system SHALL use a reduced palette composed primarily of off-white, near-black, and one or two signal accent colors, and SHALL avoid soft dashboard treatments such as glass blur, rounded cards, and decorative gradients.

#### Scenario: Main shell is rendered
- **WHEN** the renderer displays the application shell
- **THEN** the interface SHALL be composed using flat blocks, thin rules, strong typographic contrast, and minimal shadow usage

### Requirement: The design system avoids generic admin-dashboard composition
The system SHALL organize content with rows, blocks, dividers, and asymmetric editorial composition instead of repeating equally weighted rounded cards.

#### Scenario: Screen sections are displayed
- **WHEN** content groups such as settings, stats, logs, or chapter lists are shown
- **THEN** their composition SHALL read as part of a unified editorial board rather than a tiled card dashboard
