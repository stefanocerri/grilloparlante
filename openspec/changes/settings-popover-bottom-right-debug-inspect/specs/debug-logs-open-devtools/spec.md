## ADDED Requirements

### Requirement: Enabling detailed logs opens developer tools in Electron
When running inside the Electron desktop app, the system SHALL open the window’s developer tools when the user enables the detailed logs option, if developer tools are not already open, so the user can inspect elements and use the console alongside verbose logs.

#### Scenario: User turns on detailed logs in Electron
- **WHEN** the user sets the detailed logs control from disabled to enabled
- **THEN** the main process or an authorized IPC path SHALL ensure DevTools are opened for the focused BrowserWindow
- **AND** the in-app detailed log list MAY remain available as implemented

#### Scenario: User turns off detailed logs
- **WHEN** the user disables the detailed logs control
- **THEN** the system SHALL not be required to auto-close DevTools (closing remains a manual or separate concern)
