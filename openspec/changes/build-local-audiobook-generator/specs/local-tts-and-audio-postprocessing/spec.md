## ADDED Requirements

### Requirement: The system uses a pluggable local TTS layer with LuxTTS as the initial engine
The system SHALL route speech generation through a pluggable TTS adapter layer and SHALL configure LuxTTS as the initial engine for local narration jobs.

#### Scenario: LuxTTS is available
- **WHEN** the local environment provides a working LuxTTS executable or integration path
- **THEN** the system SHALL synthesize chunk audio with LuxTTS using the requested language, voice mode, speed, and voice selection

#### Scenario: LuxTTS is unavailable during development
- **WHEN** LuxTTS cannot be executed in the local environment
- **THEN** the system SHALL emit a warning and use a development-safe fallback path so the rest of the pipeline remains executable

### Requirement: The system generates audio at chunk level before final merge
The system SHALL synthesize audio for each chunk separately and keep chunk-level outputs available for inspection and merge operations.

#### Scenario: Chunk audio is written
- **WHEN** a chapter is split into one or more chunks
- **THEN** the system SHALL generate an audio file for each chunk under the job `audio/` directory

#### Scenario: Chunk progress is reported
- **WHEN** chunk audio generation is in progress
- **THEN** the system SHALL update audio chunk counts and progress information as each chunk completes

### Requirement: The system can merge chunk outputs into chapter outputs with ffmpeg or a safe fallback
The system SHALL merge chunk audio into final chapter outputs when chapter merge is enabled and SHALL preserve a safe fallback when ffmpeg is unavailable.

#### Scenario: ffmpeg is available
- **WHEN** merge-by-chapter is enabled and ffmpeg is installed locally
- **THEN** the system SHALL produce one final chapter audio file per chapter in the configured preferred format

#### Scenario: ffmpeg is unavailable
- **WHEN** merge-by-chapter is enabled but ffmpeg is not installed locally
- **THEN** the system SHALL use a documented local fallback strategy and emit a warning that the preferred merge path was unavailable

### Requirement: The system records TTS settings and warnings in the final manifest
The system SHALL include applied TTS settings, output format settings, and job warnings in the final manifest.

#### Scenario: Manifest records voice configuration
- **WHEN** a conversion completes
- **THEN** the manifest SHALL contain the TTS engine, language, voice mode, voice name, speaking speed, and optional reference audio path used for that job
