## ADDED Requirements

### Requirement: Settings entry is fixed at the bottom-right of the app shell
The system SHALL expose a single settings entry point anchored to the bottom-right region of the main window content area so it remains visually fixed while the user scrolls the primary column.

#### Scenario: User scrolls the main column
- **WHEN** the main content column scrolls
- **THEN** the settings entry control SHALL remain visible at the bottom-right of the shell (within safe padding)

### Requirement: Settings content opens in a popover overlay
The system SHALL render conversion settings inside a popover layered above the main UI instead of inserting an expandable panel into the main column layout.

#### Scenario: User opens settings
- **WHEN** the user activates the settings entry control
- **THEN** the system SHALL show the settings content in an overlay popover anchored to that control
- **AND** the main column SHALL not grow vertically solely because settings are open

#### Scenario: User dismisses settings
- **WHEN** the user presses Escape or activates a click outside the popover (excluding the entry control toggle as defined by the implementation)
- **THEN** the system SHALL close the settings popover

### Requirement: Settings popover exposes the same conversion controls as before
The popover SHALL contain the same essential conversion settings (including the detailed log visibility toggle) that the inline panel previously provided, unless explicitly superseded by another change.

#### Scenario: User adjusts a setting in the popover
- **WHEN** the user changes a value inside the open settings popover
- **THEN** the system SHALL apply that value to the next conversion job the same way as prior to this change
