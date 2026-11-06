## ADDED Requirements

### Requirement: The home screen presents upload as the dominant editorial action
The system SHALL make file upload the main visual and interaction focus of the home view through oversized headline hierarchy and a highly visible upload action.

#### Scenario: User opens the app on a fresh session
- **WHEN** no conversion is active and no result is selected
- **THEN** the user SHALL immediately see a strong upload-first home view with a drag-and-drop area and a clear file-picking action

### Requirement: The home layout uses reference-aligned composition cues
The system SHALL structure the home view with strong horizontal rules, large headline typography, flat accent zones, and sparse metadata similar in spirit to the provided references.

#### Scenario: Home view is visible
- **WHEN** the renderer draws the home screen
- **THEN** the composition SHALL avoid centered generic empty-state cards and SHALL instead use a more graphic, editorial arrangement

### Requirement: Upload metadata remains readable inside the new layout
The system SHALL still show selected file name, file type, and local path clearly after a file is chosen, even within the more aggressive visual composition.

#### Scenario: User selects a PDF or EPUB
- **WHEN** a supported file becomes the active source
- **THEN** the home view SHALL display its metadata in a readable and clearly associated location
