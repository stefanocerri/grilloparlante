## ADDED Requirements

### Requirement: Core conversion actions are grouped beside the upload area
The system SHALL present `Scegli file`, `Converti`, and `Pulisci` as one compact action cluster visually associated with the upload section.

#### Scenario: User views the main shell
- **WHEN** the home screen is visible
- **THEN** the primary action buttons SHALL appear together near the upload block instead of being scattered across the shell

### Requirement: The shell avoids duplicate top-level action controls
The system SHALL not repeat the same file and conversion actions in a separate header action area.

#### Scenario: Main screen is rendered
- **WHEN** the user scans the interface
- **THEN** the visible control layout SHALL keep one primary action cluster for the upload workflow
