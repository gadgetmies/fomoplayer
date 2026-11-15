## ADDED Requirements

### Requirement: A sample match MUST play as an aligned A/B pair

Playing a match of a sample SHALL load it in the player as an A/B pair: B is
the match's preview, A the sample. Switching from A at sample time t SHALL play
B from `offset + tempoFactor · t`; switching from B at preview time p SHALL
play A from `(p − offset) / tempoFactor`, clamped to the sample. Without a
stored offset and tempo, B SHALL start at the beginning of the preview.

#### Scenario: Switching to the match keeps the place
- **WHEN** the sample has played 4 s and the match has offset 30 s and tempo factor 1.0, and the user switches to B
- **THEN** the preview plays from 34 s

#### Scenario: Switching back to the sample
- **WHEN** B is at 36 s for the same match and the user switches to A
- **THEN** the sample plays from 6 s

### Requirement: Loop match MUST keep B inside the matched region

Playback of B SHALL wrap, while Loop match is on (the default for a pair with
offset and tempo), from `offset + tempoFactor · sampleDuration` back to `offset`.
Turning it off SHALL let the preview play on.

#### Scenario: Loop wraps
- **WHEN** Loop match is on and B passes the end of the matched region
- **THEN** playback jumps back to the start of the region
