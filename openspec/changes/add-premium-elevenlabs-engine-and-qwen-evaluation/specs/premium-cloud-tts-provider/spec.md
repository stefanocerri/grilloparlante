## ADDED Requirements

### Requirement: User can enable a premium cloud TTS provider
The application SHALL allow the user to configure a premium cloud TTS provider with an API key and select it as the active engine for conversion.

#### Scenario: User saves valid provider configuration
- **WHEN** the user enters a valid premium provider API key and confirms the configuration
- **THEN** the application stores the credential in secure desktop storage and marks the provider as available

#### Scenario: User selects premium engine
- **WHEN** the provider is configured and the user selects the premium engine in settings
- **THEN** subsequent conversions SHALL route speech synthesis through the premium provider instead of the local fallback engine

### Requirement: Premium provider failures are explicit
The application SHALL report premium provider authentication, quota, and network failures explicitly and MUST NOT silently downgrade to another engine unless the user has opted into fallback behavior.

#### Scenario: Authentication fails
- **WHEN** the provider rejects a synthesis request because the API key is invalid or revoked
- **THEN** the application shows an actionable error that identifies the provider auth failure and keeps the failed job out of the completed state

#### Scenario: Network is unavailable
- **WHEN** the user starts a premium-provider conversion while the device cannot reach the provider
- **THEN** the application reports the network failure and tells the user whether a manual retry or explicit fallback is available

### Requirement: Premium mode communicates cloud processing
The application SHALL clearly communicate that premium mode sends content and, when applicable, reference audio outside the device.

#### Scenario: User views premium engine details
- **WHEN** the premium engine is selected in settings or setup
- **THEN** the application displays copy indicating that text and any required voice assets are processed by a cloud provider
