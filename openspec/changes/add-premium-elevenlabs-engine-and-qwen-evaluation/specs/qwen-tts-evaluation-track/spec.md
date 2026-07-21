## ADDED Requirements

### Requirement: Qwen track is isolated from the default product path
The application SHALL treat Qwen3-TTS as an evaluation track behind an explicit experimental gate and MUST NOT make it the default packaged engine before evaluation criteria are met.

#### Scenario: Standard user opens the app
- **WHEN** the application starts in the normal product configuration
- **THEN** Qwen3-TTS is not selected by default and does not block the standard conversion flow

#### Scenario: Developer enables evaluation mode
- **WHEN** a developer or tester enables the Qwen evaluation track
- **THEN** the application exposes Qwen-specific setup and benchmark controls separately from stable engine choices

### Requirement: Qwen evaluation captures deployment fitness metrics
The system SHALL provide a repeatable benchmark flow for Qwen3-TTS that records quality and operational metrics relevant to desktop distribution.

#### Scenario: Benchmark run completes
- **WHEN** a Qwen evaluation run finishes
- **THEN** the system records at least model variant, hardware profile, install footprint, cold-start time, synthesis latency, and success or failure outcome

### Requirement: Qwen promotion requires explicit acceptance gates
The project SHALL define promotion gates for Qwen3-TTS before it can replace an existing engine in packaged builds.

#### Scenario: Qwen fails hardware or install gates
- **WHEN** benchmark results show that Qwen does not meet the project’s packaging, latency, or machine-compatibility thresholds
- **THEN** the project keeps Qwen in the evaluation track and does not promote it to the standard engine roster
