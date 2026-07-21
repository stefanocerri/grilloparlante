## ADDED Requirements

### Requirement: Processing view presents progress as an editorial status board
The system SHALL present processing state, current stage, stats, and logs using flat rows, rails, and typographic hierarchy rather than stacked soft panels.

#### Scenario: Conversion is running
- **WHEN** the backend emits progress and stage events
- **THEN** the processing screen SHALL display them in a visually strong layout that remains readable and clearly structured

### Requirement: Result view presents chapters like a program or index listing
The system SHALL show generated chapters and outputs in a row-based editorial list that emphasizes title, status, and playback/open actions with minimal decorative chrome.

#### Scenario: Conversion completes
- **WHEN** the app receives a successful result
- **THEN** the result screen SHALL present chapter outputs in a denser, index-like layout rather than repeated rounded cards

### Requirement: Error and empty states remain consistent with the redesign
The system SHALL render empty and error states using the same Helvetica-based editorial system, with sharp messaging and expandable technical detail where appropriate.

#### Scenario: Error state is shown
- **WHEN** a conversion fails or a required desktop bridge is missing
- **THEN** the error UI SHALL remain visually consistent with the rest of the redesigned interface and SHALL not fall back to generic browser-like messaging
