## MODIFIED Requirements

### Requirement: The system uses a pluggable local TTS layer with LuxTTS as the initial engine
The system SHALL route speech generation through a pluggable TTS adapter layer and SHALL configure LuxTTS as the initial engine for local narration jobs. Packaged desktop builds SHALL use the app-managed LuxTTS Python runtime instead of assuming an external shell executable is already present.

#### Scenario: Managed LuxTTS runtime is ready
- **WHEN** the packaged desktop runtime reports a healthy installed LuxTTS environment
- **THEN** the system SHALL synthesize chunk audio with LuxTTS using that managed runtime and the requested language, voice mode, speed, and voice selection

#### Scenario: Packaged runtime is not ready
- **WHEN** the packaged desktop runtime is missing, unhealthy, or incompatible
- **THEN** the system SHALL not start LuxTTS synthesis and SHALL report that setup or repair is required before conversion can proceed

#### Scenario: LuxTTS is unavailable during development
- **WHEN** LuxTTS cannot be executed in a development environment that intentionally allows fallback behavior
- **THEN** the system SHALL emit a warning and use a development-safe fallback path so the rest of the pipeline remains executable

### Requirement: The system records TTS settings and warnings in the final manifest
The system SHALL include applied TTS settings, runtime provenance, output format settings, and job warnings in the final manifest.

#### Scenario: Manifest records voice configuration
- **WHEN** a conversion completes
- **THEN** the manifest SHALL contain the TTS engine, runtime source or version, language, voice mode, voice name, speaking speed, optional reference audio path, and any warnings emitted during runtime setup or synthesis
