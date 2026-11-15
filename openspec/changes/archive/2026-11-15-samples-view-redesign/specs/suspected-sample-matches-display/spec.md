## ADDED Requirements

### Requirement: A sample-match email MUST link to the sample in the Samples tab

Each sample section of the sample-match notification email SHALL link its
"Listen now" button, and the matching line of the plain-text version, to
`<frontendURL>/notifications/samples?sample=<sample id>`, with the front-end
address taken from configuration.

#### Scenario: Email for one sample
- **WHEN** sample 7 gets a new fingerprint match and its owner has a verified email
- **THEN** the email's "Listen now" link for that sample is `<frontendURL>/notifications/samples?sample=7`

## REMOVED Requirements

### Requirement: Track search MUST accept a `sample:~<id>` token scoped by sample ownership
**Reason**: The `~` operator means audio similarity elsewhere (`track:~`, `cart:~`), and a sample's fingerprint matches are already listed in the Notifications page's Samples tab.
**Migration**: Use `/notifications/samples?sample=<id>` to see a sample's matches. A query that still contains `sample:~<id>` is treated as free text.

### Requirement: Default sort for `sample:~` searches MUST be `MAX(match_score) DESC`
**Reason**: Removed with the `sample:~<id>` search term.
**Migration**: The Samples tab lists matches ordered by score.

### Requirement: Settings UI MUST render an inline "N suspected matches" link per audio sample
**Reason**: Audio samples moved from Settings to the Notifications page's Samples tab, which no longer links to a search.
**Migration**: Match counts show on each sample row in the Samples tab.
