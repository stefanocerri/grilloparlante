## ADDED Requirements

### Requirement: User can load a local source file from the desktop UI
The system SHALL allow the user to import a supported local source file through drag and drop or the native file picker from the home view.

#### Scenario: Drag and drop import succeeds
- **WHEN** the user drops a supported PDF, EPUB, TXT, or MD file onto the home dropzone
- **THEN** the system stores that file as the current selected source and shows its name, type, and path in the UI

#### Scenario: File picker import succeeds
- **WHEN** the user chooses a supported source file from the native file picker
- **THEN** the system stores that file as the current selected source and shows its metadata in the UI

### Requirement: User can configure conversion settings before starting a job
The system SHALL expose local conversion settings for TTS mode, language, speaking speed, chunk target size, merge behavior, preferred output format, output directory, and temp-file retention before a job starts.

#### Scenario: User updates settings before conversion
- **WHEN** the user changes one or more settings in the job configuration panel
- **THEN** the system applies those values to the next conversion job request

#### Scenario: Optional reference audio is not required
- **WHEN** the user leaves the reference audio field empty while using standard narration mode
- **THEN** the system SHALL still allow the conversion to start without validation failure

### Requirement: User can launch, monitor, and cancel a conversion from the desktop UI
The system SHALL let the user start a conversion job, view a dedicated processing screen, and cancel the job while it is running.

#### Scenario: Conversion starts from selected file
- **WHEN** a valid source file is selected and the user clicks the convert action
- **THEN** the system opens the processing view and starts a local conversion job

#### Scenario: User cancels an active conversion
- **WHEN** the user activates the cancel action during processing
- **THEN** the system SHALL stop the active local job and update the UI to show that the job was cancelled

### Requirement: User can review results and recover from errors
The system SHALL provide dedicated result, empty, and error states with clear actions and expandable technical details when relevant.

#### Scenario: Conversion completes successfully
- **WHEN** the backend returns a successful result event
- **THEN** the system SHALL show the result view with book title, chapter list, output actions, and preview capability when audio is available

#### Scenario: Conversion fails
- **WHEN** the backend returns an error event or exits unexpectedly
- **THEN** the system SHALL show a user-friendly error state and offer expandable technical detail without discarding the overall session context
