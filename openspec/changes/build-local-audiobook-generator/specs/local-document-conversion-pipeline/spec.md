## ADDED Requirements

### Requirement: The system can detect and parse supported local document types
The system SHALL detect the source file type and use an appropriate local parser for PDF, EPUB, and simple text-based inputs without requiring a remote service.

#### Scenario: PDF source is detected
- **WHEN** the user selects a `.pdf` source file
- **THEN** the system SHALL route the job through the PDF extraction path and report the detected type in job logs and stats

#### Scenario: EPUB source is detected
- **WHEN** the user selects a `.epub` source file
- **THEN** the system SHALL route the job through the EPUB extraction path and report the detected type in job logs and stats

### Requirement: The system extracts text before any audio generation begins
The system SHALL perform text extraction before chaptering, chunking, TTS, or merge work starts.

#### Scenario: Text extraction succeeds
- **WHEN** a supported source file contains accessible text
- **THEN** the system SHALL persist the extracted text and continue to chapter detection

#### Scenario: Text extraction yields no usable text
- **WHEN** a source file does not produce usable text through the direct extractor
- **THEN** the system SHALL stop the job with a clear warning or error that OCR fallback is not yet implemented

### Requirement: The system detects chapters and falls back safely when structure is weak
The system SHALL attempt chapter detection using available TOC data first, visible heading heuristics second, and fallback sections third.

#### Scenario: Table of contents is usable
- **WHEN** the extracted document exposes reliable TOC entries that match the text body
- **THEN** the system SHALL use TOC-derived chapters and report that chapter mode in stats

#### Scenario: Chapter fallback is required
- **WHEN** the document does not contain reliable TOC or heading markers
- **THEN** the system SHALL create readable fallback sections and report fallback mode in stats and logs

### Requirement: The system creates readable chunks and writes structured job outputs
The system SHALL split chapter text into chunk units that avoid poor sentence breaks and SHALL write structured output files for the completed job.

#### Scenario: Chunking respects sentence boundaries when possible
- **WHEN** chapter text exceeds the target chunk size
- **THEN** the system SHALL prefer sentence or paragraph boundaries over arbitrary mid-sentence splits

#### Scenario: Output package is written
- **WHEN** the job reaches finalization successfully
- **THEN** the system SHALL write `manifest.json`, `raw_text.txt`, `chapters.json`, `chunks.json`, `audio/`, and `final/` in a book-specific output directory
