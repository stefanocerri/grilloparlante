## ADDED Requirements

### Requirement: User can inspect voice runtime readiness from the main workflow
The system SHALL show whether the packaged voice runtime is ready, installing, or failed before a conversion starts.

#### Scenario: Ready state is visible
- **WHEN** the home workflow is shown and the managed LuxTTS runtime is healthy
- **THEN** the system SHALL indicate that voice synthesis is ready for conversion

#### Scenario: Failed state is visible
- **WHEN** runtime installation or validation fails
- **THEN** the system SHALL show a blocked state with retry or repair actions

## MODIFIED Requirements

### Requirement: User can launch, monitor, and cancel a conversion from the desktop UI
The system SHALL let the user start a conversion job only when the selected file is valid and the required voice runtime is ready, SHALL show setup guidance when that runtime is unavailable, and SHALL let the user monitor or cancel a running job.

#### Scenario: Conversion starts from selected file
- **WHEN** a valid source file is selected and the voice runtime is ready
- **THEN** the system SHALL open the processing view and SHALL start a local conversion job

#### Scenario: Conversion is blocked until runtime setup completes
- **WHEN** a valid source file is selected but the packaged voice runtime is missing, unhealthy, or still installing
- **THEN** the system SHALL not start the conversion job and SHALL direct the user to install, wait for, or repair the runtime

#### Scenario: User cancels an active conversion
- **WHEN** the user activates the cancel action during processing
- **THEN** the system SHALL stop the active local job and update the UI to show that the job was cancelled
