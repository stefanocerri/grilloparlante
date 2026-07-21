## ADDED Requirements

### Requirement: Reference voice import accepts local media files
The application SHALL allow the user to import a local audio or video file as a reference voice source for engines that support reference cloning.

#### Scenario: User imports a supported media file
- **WHEN** the user chooses a local audio or video file in the reference voice flow
- **THEN** the application accepts the file and prepares it for downstream voice reference processing

### Requirement: Reference media is normalized before use
The application SHALL extract and normalize the reference sample into a managed local audio asset before it is passed to a cloning-capable engine.

#### Scenario: Video file is used as reference
- **WHEN** the user provides a local video file as reference input
- **THEN** the application extracts the audio track, converts it into a supported reference format, and stores the managed sample in application data

#### Scenario: Audio quality is insufficient
- **WHEN** the prepared reference sample fails minimum validation for duration, readability, or single-speaker quality
- **THEN** the application rejects the sample with a message that tells the user how to improve it

### Requirement: Reference import stays local-first
The standard reference import workflow SHALL accept local files and MUST NOT require direct ingestion from third-party video URLs.

#### Scenario: User wants to use a YouTube clip
- **WHEN** the user attempts to use a third-party video URL as a reference source
- **THEN** the application instructs the user to provide a local file instead of automatically downloading the remote media

### Requirement: Consent is explicit for reference voices
The application SHALL require the user to confirm that they have the right to use the imported voice sample before synthesis begins.

#### Scenario: User imports a new reference sample
- **WHEN** the application finishes preparing the reference sample
- **THEN** it asks for explicit confirmation that the user has consent or rights to use that voice
