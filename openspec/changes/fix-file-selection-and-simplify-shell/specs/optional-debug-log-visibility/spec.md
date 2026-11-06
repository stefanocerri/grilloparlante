## ADDED Requirements

### Requirement: Detailed logs are hidden by default
The system SHALL hide the verbose log console when the app first opens unless the user explicitly enables it.

#### Scenario: Fresh app launch
- **WHEN** the renderer loads the default shell
- **THEN** the detailed log area SHALL not be visible by default

### Requirement: User-facing messages remain visible without the full log console
The system SHALL continue to show important progress notes, warnings, and errors even when detailed logs are hidden.

#### Scenario: Conversion emits feedback
- **WHEN** the backend sends progress, warning, or error events
- **THEN** the UI SHALL surface concise user-facing messages without requiring the verbose log panel to be open

### Requirement: Detailed log visibility is controlled from settings
The system SHALL let the user enable or disable the detailed log console from a settings control.

#### Scenario: User opens settings
- **WHEN** the settings panel is visible
- **THEN** the panel SHALL include a checkbox that controls whether detailed logs are shown
