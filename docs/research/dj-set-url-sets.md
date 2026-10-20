# DJ set tracklists: four real sets from URLs

On 2026-10-18 the shipped pipeline in `packages/back/scripts/dj-set/` (master at 5f85d64eb, no code changes) was run on four real DJ sets downloaded with yt-dlp. Production was read through a read-only session, with one local mirror database per set. Each result was compared with the set's published tracklist.

## Sets and tracklist sources

| Set | Audio | Published tracklist |
|---|---|---|
| Skeptical, STUDIO Invites, Petit Bain, Paris | [SoundCloud](https://soundcloud.com/wearestudio/skeptical-dj-set-studio-invites-drum-bass-breaks-dubstep-petit-bain-france) | [YouTube comment by @the_id_guy9231](https://www.youtube.com/watch?v=uOpI-R0a580&lc=Ugwu7xECpv-djRY4k114AaABAg) on the YouTube upload, 54 rows (17 ID) |
| Sorza, Rampage Open Air 2026 | [YouTube](https://youtu.be/xBCNkOGdrWM) | [YouTube description](https://www.youtube.com/watch?v=xBCNkOGdrWM), 44 rows (23 ID) |
| Samurai Breaks b2b Napes w/ Blackeye MC, Boomtown 2025 | [YouTube](https://youtu.be/j48UNIwKZ8A) | None found on YouTube, the Critical Music SoundCloud upload or 1001tracklists |
| Wispy, Steps Podcast S2 E2 | [Mixcloud](https://www.mixcloud.com/wispy/wispy-steps-podcast-s2-e2/) | Mixcloud tracklist, 85 rows |

The Mixcloud tracklist is not in the page HTML. It comes from a POST to `https://app.mixcloud.com/graphql` with `cloudcastLookup(lookup: {username, slug}) { sections { ... on TrackSection { artistName songName startSeconds } } }`.

## Results

| Set | Recall, named | Recall, fingerprinted version | Precision | Precision, strict |
|---|---|---|---|---|
| Skeptical | 13/37 (35 %) | 13/19 (68 %) | 14/20 (70 %) | 14/32 (44 %) |
| Sorza | 2/21 (10 %) | 2/9 (22 %) | 2/2 | 2/9 (22 %) |
| Wispy S2 E2 | 48/85 (56 %) | 48/48 (100 %) | 50/70 (71 %) | 50/70 (71 %) |
| All three | 63/143 (44 %) | 63/76 (83 %) | 66/92 (72 %) | 66/111 (59 %) |

How the numbers are counted:

- A published row's slot runs from its start to the next row's start, ±90 s. A play is **correct** when its title contains the row's core title, it shares an artist word, and it overlaps the slot.
- **Recall, named** counts rows with a real artist and title. **Recall, fingerprinted version** counts only rows whose track, in the version played, has at least one fingerprinted preview in production.
- **Precision** counts plays that overlap named rows. Plays that overlap only ID rows are counted separately. **Strict** precision also counts ID-slot plays that don't fit the set (genre, tempo, the dark-ambient cluster below) as wrong.
- Samurai Breaks b2b Napes has no tracklist and is not in the totals. 17 of its 25 plays fit the set: the pair's own Wavelord Bizniz (score 318) and Violent Violin's, Napes – Steppin On Toes and Shaolin Sniper, Samurai Breaks – The Wickedest, Blister Pack and Numba1, Dub Phizix – Like a Rope and Doberman, Hoax – Ain't No Other, and Boogie Times Tribe – The Dark Stranger (Metrodome & Sl8r Remix).

## Findings

### Catalogue coverage limits recall

When the version played has a fingerprinted preview, the pipeline usually finds it: 48/48 in Wispy's mix of released tracks. Most misses have no fingerprinted preview: 67 of the 143 named rows across the three judged sets. They are unreleased edits, VIPs and bootlegs, tracks missing from the stores Fomo Player follows, and Bandcamp or Spotify entries without fingerprints. Bandcamp previews (full tracks) were still being fingerprinted by the drain at the time.

### Seen but rejected vs never seen

For each fingerprinted miss, `windows_seen` counts the 30 s windows that had the track as a candidate.

- **Skeptical**: 5 of the 6 fingerprinted misses were seen and then rejected in refinement: Push Up (7 windows, best score 9), Box Clever (Skeptical Remix) (4, 7), Six Gold Coins (4, 11), Diplodocus (Skeptical Remix) (8, 7) and Buss Up (5, 6). Particle – Double Stack was never seen. A lower refinement threshold might recover these; it is untested.
- **Sorza**: most of the set is Sorza's own edits and flips, so the released preview audio never plays. Of the 7 fingerprinted misses, 5 were never seen (No Style, Roth, Bvnquet – Hahaha, Borne – Control, The Glitch Mob – Higher (Sorza Remix)); Oski – Cry was seen in 1 window, Fabian Mazur – Touch (Sorza Remix) in 6.

### A dark-ambient false-positive cluster in every set

40 plays across the four sets come from a few dark-ambient and dark-techno labels that none of these DJs played: Cryo Chamber, PAVOR NOCTURNUS, Circular Limited, Counter Pulse, Children Of Tomorrow, and a few others. They arrive in bursts, several previews within a minute or two. Their tempo factors are scattered over the whole ±8 % search range, while the genuine plays here sit between 0 and +2.5 %. They pass the significance gate (10–16). The passages are not quiet (RMS −8 to −13 dB, the same as the rest of each set), so this is not silence matching silence. In Wispy, removing the cluster raises precision from 50/70 to 50/59 (85 %).

Two possible fixes, both untested and each a code change: a per-preview prior (how often a preview matches across unrelated sets), or a limit on how many new plays can start at the same time.

## Hand corrections

Spelling differences between the published tracklists and the catalogue were mapped by hand:

- Sorza: "TGM – Higer (Sorza Remix)" is The Glitch Mob – Higher (Sorza Remix).
- Skeptical: "DMF – Sustance" has artist and title swapped.
- Wispy: Kid Drama – Edge of Night and Frostbite are credited to CNVX in the catalogue. Need For Mirrors – Lambo was played as the Amen Mix, but only the Lambo VIP is fingerprinted.

## Data and scripts

The audio, fingerprints, tracklists and judging scripts are on the local DJ disk, not in the repo:

- `/Volumes/DJ/dj-set-tests/<set>/`: audio (`set.*`), `set.fps.json`, `set.tracklist.json`, `published.json`, `lookup.json` (catalogue lookup per published row), `overrides.json` (hand corrections), `judged.json`.
- `/Volumes/DJ/dj-set-tests/scripts/`: `lookup.py`, `judge.py`, `report.py` (with `report.css`, `report-intro.html`, `report-outro.html`, `sets.json`), `loose.sh`.
- `/Volumes/DJ/dj-set-tests/report/dj-sets-from-urls.html`: the full report, with a timeline per set, every play and every published row.

To repeat a run:

```bash
export PATH=/opt/homebrew/opt/openjdk/bin:$PATH   # Panako fails silently without brew's JDK
cd analyser && venv/bin/python fingerprint_set.py /Volumes/DJ/dj-set-tests/skeptical/set.m4a \
  -o /Volumes/DJ/dj-set-tests/skeptical/set.fps.json
createdb -h localhost fomoplayer-dj-set-skeptical
cd ../packages/back && DATABASE_URL="$PROD_DATABASE_URL" node scripts/dj-set/tracklist.js \
  --fingerprints=/Volumes/DJ/dj-set-tests/skeptical/set.fps.json \
  --output=/Volumes/DJ/dj-set-tests/skeptical/set.tracklist.json \
  --mirror-url=postgres://localhost/fomoplayer-dj-set-skeptical
```

A local mirror takes about 1.2 GB of system disk per 90 minutes of set, and about 3 GB for the 3.4-hour Wispy mix. Drop each mirror after its run when the system disk is short.
