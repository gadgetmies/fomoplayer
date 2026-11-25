## ADDED Requirements

### Requirement: A killed combined worker's audio MUST NOT accumulate

`analyse_all.sh` MUST run the combined preview worker with a fixed work
folder per session (`analyser/work/<session>`), and the worker MUST delete
the leftover files it writes there (`preview_*.mp3`, `preview_*.wav`,
`waveform_*.png`) when it starts, leaving any other file in place.

#### Scenario: Restart after a kill
- **WHEN** a worker is killed with decoded previews in its work folder and the window loop starts the next one
- **THEN** the leftover previews and waveform images are deleted before the new worker downloads anything

#### Scenario: Other files are kept
- **WHEN** the work folder holds a file the worker did not write
- **THEN** that file is left in place
