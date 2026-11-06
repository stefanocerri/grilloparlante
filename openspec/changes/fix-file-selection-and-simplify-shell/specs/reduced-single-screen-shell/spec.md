## ADDED Requirements

### Requirement: Settings are visually secondary to upload and conversion
The system SHALL present settings through a smaller bordered icon button rather than a large primary callout.

#### Scenario: Main shell is visible
- **WHEN** the user first opens the app
- **THEN** the settings trigger SHALL read as a secondary utility control

### Requirement: The main shell keeps only indispensable always-visible sections
The system SHALL keep the app on one screen and avoid permanently reserving large space for non-essential technical panels.

#### Scenario: Default screen composition is rendered
- **WHEN** no advanced debugging option is enabled
- **THEN** the visible shell SHALL prioritize upload, action buttons, status, and result content over technical console blocks
