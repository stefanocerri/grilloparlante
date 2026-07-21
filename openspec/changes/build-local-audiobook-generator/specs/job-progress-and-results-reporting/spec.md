## ADDED Requirements

### Requirement: Desktop and backend processes communicate through structured job events
The system SHALL use a structured local event protocol between Electron and Python that includes at least `ready`, `stage`, `progress`, `stats`, `log`, `warning`, `result`, `error`, and `cancelled` events.

#### Scenario: Backend emits stage and progress updates
- **WHEN** the conversion job advances through ingestion, extraction, chaptering, chunking, TTS, merge, and finalize stages
- **THEN** the backend SHALL emit structured events that the desktop UI can map to visible progress and stage labels

#### Scenario: Backend emits a final result
- **WHEN** the conversion job completes successfully
- **THEN** the backend SHALL emit a structured result payload containing manifest paths, chapter summaries, and final audio file locations

### Requirement: The desktop UI surfaces logs, stats, and warning badges in real time
The system SHALL show live logs, current stage, elapsed time, chapter count, chunk count, audio chunk count, and warning badges while the job is active.

#### Scenario: Stats update during processing
- **WHEN** the backend emits new stats payloads during the job
- **THEN** the desktop UI SHALL refresh the processing view without blocking or reloading the window

#### Scenario: Warning condition is detected
- **WHEN** the backend emits a warning such as missing LuxTTS, missing ffmpeg, OCR not used, or fallback chaptering
- **THEN** the desktop UI SHALL surface that condition as visible warning or status messaging during or after the job

### Requirement: Session results persist in memory during the current app session
The system SHALL keep recent completed results available in memory so the user can revisit them without rerunning the conversion during the same desktop session.

#### Scenario: User reopens a recent result
- **WHEN** the user selects a previously completed result from the recent list during the same session
- **THEN** the desktop UI SHALL reopen the stored result summary and chapter information from memory
