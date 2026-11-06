## ADDED Requirements

### Requirement: Engine selection exposes stable and experimental paths
The application SHALL present voice engines with clear product labels that distinguish local stable fallback, premium cloud quality, and experimental engines.

#### Scenario: User opens voice settings
- **WHEN** the user opens the voice settings panel
- **THEN** the application shows each engine with a label or description that communicates its trade-off in terms of quality, setup, and reliability

### Requirement: Conversion gating depends on selected engine
The application SHALL block conversion only when the currently selected engine is unavailable, and MUST NOT block conversion because of an inactive engine.

#### Scenario: XTTS beta is broken but local engine is selected
- **WHEN** the experimental XTTS runtime is unavailable and the selected engine is the local system engine
- **THEN** the convert action remains available

#### Scenario: Premium engine is selected but not configured
- **WHEN** the user selects the premium cloud engine without completing provider setup
- **THEN** the application disables conversion for that engine and explains the missing setup step

### Requirement: Engine switches preserve user intent
The application SHALL preserve compatible settings when switching engines and SHALL reset incompatible settings with an explicit explanation.

#### Scenario: User switches from XTTS reference mode to local engine
- **WHEN** the user changes the active engine from XTTS with reference settings to the local system engine
- **THEN** the application resets unsupported reference-only options and explains that the local engine does not use reference cloning
