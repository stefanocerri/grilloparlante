## ADDED Requirements

### Requirement: Manual file selection reliably opens from the upload action
The system SHALL open a local file selector when the user activates `Scegli file` from the upload area.

#### Scenario: User clicks `Scegli file`
- **WHEN** the app is idle or ready for a new source file
- **THEN** the system SHALL open a supported file picker and SHALL allow choosing a local `PDF`, `EPUB`, `TXT`, or `MD` file

### Requirement: Drag-and-drop remains available as a first-class upload path
The system SHALL allow the user to drag a supported local document into the upload surface and use it as the active source file.

#### Scenario: User drops a supported file on the upload area
- **WHEN** the dropped file is a supported local document
- **THEN** the system SHALL accept it and SHALL update the selected-file state exactly as if it had been chosen manually

### Requirement: Manual selection and drag-and-drop produce consistent file metadata
The system SHALL normalize file name, path, type, and size consistently regardless of how the file was selected.

#### Scenario: File becomes active
- **WHEN** the source file is selected manually or via drag-and-drop
- **THEN** the UI SHALL show the same style of file metadata and SHALL not require separate handling from the conversion flow
