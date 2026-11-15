# Design

## Context

The Samples tab is `renderSamples`, `renderMatches` and `renderSimilar` in
`packages/front/src/NotificationsPage.js`. Samples sit in one table, and the
selected sample's matches and Sounds like tables follow underneath, both
always shown. State already holds `selectedSampleId`, `matches` and `similar`,
loaded by `selectSample(id)`. The tab is reached at `/notifications/samples`
(routing in `App.js` passes `tab`). The design reviewed with the owner is
option B of the "Sample tab redesign" canvas.

Data used as is: `GET /me/notifications/audio-samples` (samples with
`matchCount`), `/:id/matches` (ordered by score), `/:id/similar`
(`{ tracks, follow, pending }`). Following goes through the existing
`POST /me/follows/{artists,labels}` with internal ids, which follows every
store entry of that artist or label.

## Goals / Non-Goals

**Goals:**
- Keep the existing data flow and API shapes. The only server behaviour
  changes are the follow-suggestion order, the removed search term and the
  email link.
- Reuse existing components and classes: `select-button` tab rows,
  `button-push_button` buttons, `SpinnerButton`, the `#666` rows with
  `#5181bd` for playing or selected, and the `new-dot`.

**Non-Goals:**
- Any change to the tab bar, Activity, Subscriptions, the player or the
  Follow popup.
- Per-store follow buttons or artist and label images in suggestions; the
  similar endpoint returns cross-store entities only.

## Decisions

**Accordion keyed by `selectedSampleId`.** The open sample is the existing
selected sample. Activating an open row sets it to `null` (all closed), so no
new state is needed. A separate `samplesView` state ('matches' | 'similar')
holds the toggle and resets to 'matches' in `selectSample`. Alternative
considered: keep several samples open at once. Rejected because each open
sample would need its own match and similar data, multiplying requests, and
the problem being solved is losing track of which list belongs to which
sample.

**Whole-row toggle without nesting buttons.** The row is a positioned
container. Its first child is a real `<button aria-expanded>` that covers the
row (`position: absolute; inset: 0`) and carries the accessible name "Show
matches for <file>". Play and delete are separate `<button>`s placed above it
(`position: relative`). The name, the divider and the chevron are
`pointer-events: none` decoration. This avoids invalid nested buttons and
keeps clicks on the name, the empty space and the chevron opening the row.
Alternative considered: a separate chevron button only. Rejected because the
target would be small and the name would not open the row.

**Toggle in the header bar.** When a row is open, its header gains the
Matches / Sounds like `select-button` row: inline before delete on desktop,
and as a full-width second line inside the header under the 768 px breakpoint
the page already uses. The toggle container uses the `#222` select-button
background so the `#5996e4` selected tab stands out on the `#5181bd` bar.

**Rows on phones.** Matches and similar lists render as row elements (not
`<table>`) with CSS grid. Above 768 px the grid has the existing columns
(New, Artist, Title, Label, Matched at, Tempo, Score; Artist, Title, Label,
Similarity) with a header row. At 768 px and below the same rows collapse to
two lines, with no header and no horizontal scroll. One markup path with two
layouts keeps tests and behaviour identical across widths. The existing
`.notifications-table-wrapper` sideways scroll is no longer used by the
Samples tab.

**Follow buttons.** Suggestions render as `SpinnerButton size="large"` with
the `heart` icon and the text "Follow <name>" plus a lighter "· N similar
tracks", grouped under Artists and Labels, one per row (`flex-direction:
column; align-items: flex-start`). This is the `FollowItem` look without its
per-store parts. A followed suggestion is removed from local state at once,
and the list is refreshed on the next sample load.

**Follow-suggestion order.** `tallyFollowSuggestions` filters out entries the
user follows before sorting and slicing to five, and returns only unfollowed
entries (`followed: false` kept in the shape for compatibility). The
front end no longer renders a Following state.

**Deep link `?sample=<id>`.** `NotificationsPage` reads the `sample` query
parameter when the Samples tab loads. If it names one of the loaded samples,
it selects it instead of the first, then scrolls its row into view once
rendered. An unknown id falls back to the current default.

**Removing `sample:~`.** Delete the `sampleSearchId` / `sample_match_score` /
`useMatchScoreSort` branches in `search.js`, remove `sample` from the
similarity-term regex there, and delete
`test/tests/users/tracks/search-sample-token.js`. The email job builds
`${frontendURL}/notifications/samples?sample=${sampleId}`; `frontendURL`
still comes from config. The unused `.suspected-matches-link` rules in
`Settings.css` go too.

## Risks / Trade-offs

- [Old emails link to `sample:~<id>`] → They now run a free-text search with
  no useful results. Acceptable: the email's track list still names the
  matches, and the Samples tab is one click from the top bar.
- [Toggle state is shared by all samples] → Opening another sample resets to
  Matches. Intended: matches are the primary content.
- [The large Follow buttons take more height] → Up to five, one per row. This
  sits under the similar list, so it does not push the matches away.
- [The whole-row button covers the row] → Screen readers get one named
  expand button plus the play and delete buttons. Keyboard order follows the
  DOM: expand, play, delete.

## Migration Plan

Front end and server ship together in one deploy; no database change.
Rollback is a revert of the merge.
