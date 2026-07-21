## ADDED Requirements

### Requirement: Packaged desktop installs a managed LuxTTS runtime for the user
The packaged desktop app SHALL install a compatible LuxTTS runtime into an app-managed location without requiring the user to open Terminal or manually install Python or LuxTTS.

#### Scenario: First packaged launch requires setup
- **WHEN** a packaged app starts on a machine without a healthy managed LuxTTS runtime
- **THEN** the system SHALL present an install flow and SHALL create the runtime under an app-managed directory

#### Scenario: Healthy runtime already exists
- **WHEN** a compatible managed LuxTTS runtime is already installed for the current app version and architecture
- **THEN** the system SHALL reuse that runtime and SHALL not reinstall it before allowing conversion

### Requirement: Managed LuxTTS runtime is validated and repairable
The system SHALL validate the installed LuxTTS runtime before marking it ready and SHALL offer a repair or reinstall path when validation fails.

#### Scenario: Runtime validation fails
- **WHEN** the managed LuxTTS runtime is missing files, has an incompatible architecture, or fails a health check
- **THEN** the system SHALL mark the runtime as not ready and SHALL offer a repair or reinstall action

#### Scenario: Repair succeeds
- **WHEN** the user starts a repair or reinstall flow for a failed managed runtime
- **THEN** the system SHALL rebuild the runtime and SHALL mark it ready only after validation passes

### Requirement: Runtime installation progress is visible to the desktop UI
The system SHALL report runtime installation stages, progress, and actionable failures to the desktop UI.

#### Scenario: Installation is running
- **WHEN** the managed LuxTTS runtime is being installed or repaired
- **THEN** the system SHALL emit progress information that the UI can show as setup status

#### Scenario: Installation fails
- **WHEN** the managed LuxTTS runtime install flow encounters an error
- **THEN** the system SHALL emit a failure state with enough detail to support retry or repair
