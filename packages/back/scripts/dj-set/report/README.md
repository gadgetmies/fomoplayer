# DJ set recognition reports

Snapshots of the offline evaluation, exported from Lavish as single HTML files
(open directly in a browser; fonts and CDN styles load from the network).

- `dj-set-recognition-2026-10-17.html` — S30 Warm Up (render 564) and variants
  A–D against exact ground truth rebuilt from the AKIN catalog: recall 22/28,
  precision 23/25. Written before the change merged; its closing note about
  nothing being committed or deployed describes that day. The matcher and this
  pipeline shipped on 2026-10-18.
- `dj-sets-from-urls-2026-10-18.html` — four real sets downloaded from
  SoundCloud, YouTube and Mixcloud (Skeptical, Sorza, Samurai Breaks b2b Napes,
  Wispy Steps S2E2), judged against their published tracklists: recall 63/76
  on tracks with a fingerprinted preview, precision 66/92. Each recognised play
  links to a YouTube search and, for SoundCloud and YouTube, to the set at
  that position. Write-up: `docs/research/dj-set-url-sets.md`.
