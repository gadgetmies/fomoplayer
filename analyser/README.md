# Instructions

Install pyenv with the following command: 

```brew install pyenv```

Install python 3.13 with the following command: 

```pyenv install 3.12```

Create a virtual environment with the following command: 

```python3 -m venv venv```

Activate the virtual environment with the following command: 

```source venv/bin/activate```

Install dependencies with the following command: 

```pip install -r requirements.txt```

Initialise Postgres vector database

```brew install postgres```
```brew install pgvector```
```createdb multi-store-player-vector```
```createdb multi-store-player-vector-test```

Run the analyser:

```python3 main.py```

## Running all workers under one tmux session

`analyse_all.sh` is the recommended driver for keeping every analyser
worker drained on a worker host. It launches a `tmux` session with one
window per `(action × target)` pair, each running its own loop around
the existing Python entry points until the backend queue is empty.

```bash
# Drain preview-side fingerprints, embeddings, and waveforms:
./analyse_all.sh --previews

# Drain audio-sample fingerprints only:
./analyse_all.sh --audio-samples

# Drain both targets — four windows total:
./analyse_all.sh --previews --audio-samples

# Same, with the analyser's purchased flag and a custom batch size,
# without attaching to the session:
./analyse_all.sh --previews --purchased --batch-size 20 --no-attach
```

### Flags

| Flag                    | Effect                                                                                |
|-------------------------|---------------------------------------------------------------------------------------|
| `--previews`            | Spawn `fingerprint-previews`, `embedding-previews`, `waveform-previews` windows.      |
| `--audio-samples`       | Spawn `fingerprint-samples` window.                                                   |
| `--purchased`           | Pass `-p true` to the `embedding-previews` worker (`main.py`).                        |
| `--batch-size N`        | Pass `-b N` to every spawned worker (where supported).                                |
| `--model NAME`          | Pass `-m NAME` to `main.py`. Default `discogs_multi_embeddings-effnet-bs64-1`.        |
| `--session NAME`        | tmux session name. Default `analyser`.                                                |
| `--layout L`            | `windows` (default) — one tmux window per worker. `panes` — all workers as tiled panes in a single `workers` window with per-pane title bars. |
| `--no-waveform`         | Skip the `waveform-previews` worker (useful when the `WAVEFORM_STORAGE_*` MinIO env vars are not configured). |
| `--skip-sanity-confirmation` | Pass `--skip-sanity-confirmation` through to `main.py` — embedding-collision warnings are logged but no longer block on a y/N prompt. Recommended for unattended drains. |
| `--score-after N`       | Pass `--score-after N` through to `panako_processor.py --previews`. After every N successfully fingerprinted previews in one invocation, the worker pauses and re-scores all samples that have fingerprints, persisting results into `user_notification_audio_sample_match`. Only effective when `--batch-size >= N` (counter is per-invocation). |
| `--no-attach`           | Don't `tmux attach` at the end; print the attach command instead.                     |

### Window names

- `fingerprint-previews` — `panako_processor.py --previews`
- `embedding-previews` — `main.py`
- `waveform-previews` — `waveform.py`
- `fingerprint-samples` — `panako_processor.py --audio-samples`

Each window's loop re-invokes its worker while it exits `0`, sleeps 5 s
and retries on any other non-zero status, and breaks cleanly when the
worker exits `2` (queue drained). Windows are created with
`remain-on-exit on`, so the pane stays visible with its final
scrollback after the loop ends — operators can review what the worker
last printed before closing the session.

### `exit(2)` convention for empty queues

`main.py`, `panako_processor.py`, and `waveform.py` now exit with status
`2` when their "next batch" backend endpoint returns an empty list, and
status `0` after processing a non-empty batch. Other non-zero statuses
mean unrecoverable error. `analyse_all.sh`'s per-window loop uses this
to distinguish "drained" from "error" — log-line parsing is no longer
needed.

### Preconditions

The orchestrator validates these at startup and exits non-zero with a
clear message if any fails — no tmux session is created until they all
pass:

- `tmux` is on `PATH`.
- `analyser/venv/bin/activate` exists.
- `FOMOPLAYER_API_URL` is set.
- The chosen `--session` name is not already in use.
- At least one of `--previews` / `--audio-samples` is supplied.

`tmux` is a hard runtime dependency on the analyser host (install via
`brew install tmux` or `apt install tmux`).

### Interleaved sample scoring during preview fingerprinting

`panako_processor.py --previews` can be configured to pause after every
N successfully fingerprinted previews and run sample matching across
every sample that has fingerprints — useful for smoke-testing that the
freshly extracted preview corpus is actually matchable against known
samples. Pass `--score-after N`:

```bash
# Fingerprint 2000 previews per invocation, score every 1000:
python panako_processor.py --previews -b 2000 --score-after 1000
```

The scoring pass uses:

- `GET /admin/exact-match/audio-samples` (**new** — needs deploy) — list
  every sample with fingerprints. If this returns 404 the worker logs a
  clear message and skips the scoring pass; deploy the backend change
  before relying on `--score-after`.
- `GET /admin/exact-match/audio-samples/:sampleId/match` (existing) —
  the read-only match query that's already deployed. The analyser uses
  this per sample to compute matches.

**Temporary local storage of results.** Until the new persist endpoint
(`POST /admin/exact-match/audio-samples/:sampleId/matches`) is
deployed, match results are written to
`analyser/sample_match_results.jsonl` (gitignored, append-only), one
JSON line per (sample, scoring pass):

```json
{"timestamp":"…","sample_id":42,"filename":"foo.mp3","match_count":3,"matches":[…]}
```

Inspect with `jq`:

```bash
# Top-scoring matches across all passes
jq -s 'map(.matches[0] // empty) | sort_by(.match_score) | reverse | .[:20]' \
  analyser/sample_match_results.jsonl

# Most recent result per sample
jq -s 'group_by(.sample_id) | map(max_by(.timestamp))' analyser/sample_match_results.jsonl
```

Once the new persist endpoint is deployed, switch
`score_sample_via_existing_endpoint` in `panako_processor.py` to POST
to the new endpoint and drop the local file (it's a transition aid,
not a long-term store).

**Gotcha — counter is per-invocation.** The counter resets on every
worker invocation (i.e. every batch under `analyse_all.sh`). So with
`--batch-size 10 --score-after 1000`, scoring never fires (10 < 1000
per invocation). To use scoring effectively, set
`--batch-size >= --score-after` or run `panako_processor.py` directly
with a large batch. From the orchestrator:

```bash
./analyse_all.sh --previews --batch-size 2000 --score-after 1000
```

Set `--score-after 0` to disable.

### Backward compatibility

`analyse.sh` is left in place unchanged for operators currently using
it; its `while true; do …; done` loop ignores exit codes, so the new
`exit(2)` convention does not affect it. New deployments should prefer
`analyse_all.sh`.

### Embedding sanity check

`main.py` fingerprints every embedding it generates (SHA256 of the
vector rounded to 6 decimals) and persists the last N fingerprints to
`analyser/.embedding_sanity.json` (gitignored). Before posting a new
embedding, it checks the fingerprint against that window — if two
**different** input sources produce a bit-identical vector, that
almost always means the model is degenerate (constant or all-zero
output), not that two tracks genuinely sound alike.

#### What counts as "different source"

Two entries with the same hash are flagged **only if** they're from
different sources. The exclusion rules:

- **Same preview/sample id** — a re-analysis of the same input is
  expected to produce the same embedding; never flagged.
- **Same `track_id`** (previews only) — two previews of the same
  store track (e.g. a Beatport preview and a Bandcamp preview of the
  same release) legitimately produce identical embeddings if the
  source audio is the same; never flagged.
- **Anything else** with the same hash → collision.

#### Collisions file

Every collision pair is appended to
`analyser/embedding_collisions.jsonl` (gitignored, append-only). Each
line is one pair:

```json
{"timestamp":"…","hash":"…","new":{"id":"preview-2","label":"track_id=200","group_key":"200"},"old":{"id":"preview-1","label":"track_id=100","group_key":"100"}}
```

When a new embedding collides with N earlier entries in the window,
N lines are appended (one per pair) — the warning only prints the
first to avoid log spam, but the file has them all.

To reconstruct clusters of items that share the same embedding:

```bash
jq -s 'group_by(.hash) | map({
  hash:  .[0].hash,
  ids:   ([.[].new.id] + [.[].old.id]) | unique,
  tracks:([.[].new.group_key] + [.[].old.group_key]) | unique
})' analyser/embedding_collisions.jsonl
```

#### Operator flow

On a collision `main.py` prints a `[sanity] WARNING …` and then, by
default, prompts `Continue anyway? [y/N]`. Operators can:

- Answer `y` to continue (no further prompts that run).
- Answer `n` (or default) to abort the batch with exit code 1.
- Pass `--skip-sanity-confirmation` to skip the prompt entirely —
  warnings still log to stdout AND collisions still append to
  `embedding_collisions.jsonl`, but the worker keeps going.
  Required for unattended runs under
  `analyse_all.sh --skip-sanity-confirmation`.
- Pass `--sanity-window 0` to disable the check entirely (e.g. for
  benchmarks where many identical inputs are expected).

Defaults: `--sanity-window 20`, prompting on. The window file is
small (a few KB) and rotated to its size cap on every write; the
collisions file grows unbounded — rotate or `truncate` it manually
when you're done investigating.

## Authentication

The analyser authenticates to the Fomo Player backend with a long-lived Fomo
Player API key (`Authorization: Bearer fp_...`), the same credential the
`fomoplayer` CLI uses. There is no Google OIDC login, browser, or loopback
server — those were removed.

Set up a key on an **admin** account:

```bash
# In packages/cli, with FOMOPLAYER_API_URL exported:
fomoplayer login            # writes apiKey to the CLI config file
fomoplayer keys             # (optional) mint a dedicated higher-limit key
```

Then provide the credentials to the analyser via environment variables (e.g. in
`analyser/.env`):

- `FOMOPLAYER_API_URL` — backend base URL **including the `/api` prefix**, e.g.
  `https://fomoplayer.com/api`. Required; the analyser exits if it is unset.
- `FOMOPLAYER_API_KEY` — the `fp_...` key. Optional: if unset, the analyser
  falls back to the `apiKey` field in the `fomoplayer` CLI config file written
  by `fomoplayer login`. The CLI uses the `conf` npm package (via `env-paths`),
  so the path is OS-specific:
    - **macOS:** `~/Library/Preferences/fomoplayer-nodejs/config.json`
    - **Linux:** `$XDG_CONFIG_HOME/fomoplayer-nodejs/config.json` (default
      `~/.config/fomoplayer-nodejs/config.json`)
    - **Windows:** `%LOCALAPPDATA%\fomoplayer-nodejs\Config\config.json`

  The analyser also accepts a legacy `~/.config/fomoplayer/config.json` path
  (without the `-nodejs` suffix) for backward compatibility. If neither the
  env var nor any of these paths yield a key, the analyser exits with an
  actionable error.

**Prerequisites for the key's account:**

- **Admin subject.** The account must have an OIDC subject listed in the
  backend's `ADMIN_USER_SUBS`; otherwise every `/admin/*` call returns
  `403 {"error":"Access denied"}` and the analyser surfaces that requirement in
  its error message.
- **Rate limits.** API keys carry per-minute / per-day limits. The analyser's
  batch loops (`analyse.sh`) can be request-heavy, so mint the analyser's key
  with limits that suit the batch cadence.

## Tuning the sample matcher

To sweep `SAMPLE_MATCH_DEFAULT_THRESHOLD` / `SAMPLE_MATCH_BUCKET_SECONDS`
against curated production sample → preview pairs and emit per-cell
accuracy / recall / FPR, see [`eval/README.md`](eval/README.md). The
eval is a manual investigation tool — the CI gate stays the hermetic
regression test described below.

## Debugging sample matching

When a user-uploaded audio sample fails to match the expected store
preview (e.g. `mantra_rec.mp3` should match `mantra_preview.mp3`), reach
for the local CLI first — it isolates extraction-side issues without
needing a running backend or production DB access:

```bash
python debug_match.py
```

The script runs Panako on the four built-in fixture pairs in `data/`
and reports per-file fingerprint counts, hash intersection, Jaccard /
containment, and the top buckets of the `Δt = position_preview −
position_sample` histogram. It exits non-zero when any positive pair
fails to produce a dominant Δt peak (peak ≥ 3× the median bucket
count over the rest of the histogram).

**Exit non-zero means: the extractor stage failed; the backend matcher
is not the suspect.** Inspect the audio conversion (pydub sample rate /
channels) or the Panako version before looking at storage or scoring.

The script accepts `--pair A B` to compare arbitrary files, `--json`
for machine-readable output, and `--bucket-seconds` / `--peak-multiplier`
to tune the heuristic.

If `debug_match.py` shows healthy overlap and a clean Δt peak for a
pair but the backend matcher still doesn't surface the match, hit the
backend diagnostics endpoint to compare local extraction against what
the database actually has:

```
GET /api/admin/exact-match/diagnostics?sampleId=<id>&previewId=<id>
```

The response includes the per-side hash counts, intersection sizes,
Jaccard / containment, the top 20 offset-histogram buckets, and
`currentScorerWouldReturn` — the score `findExactMatchForSample` would
emit for this pair at the supplied or default threshold. Disagreement
between local CLI and backend diagnostics means the upload / storage
stage corrupted or dropped fingerprints; agreement means the bug is
in the scoring SQL (compare `currentScorerWouldReturn` to the
threshold).

### Sample-matching fix history (2026-05-24)

The diagnostics tooling above was added to isolate where the
recording-vs-original matching pipeline broke. Running it against the
six fixtures in `data/` (mantra_full, mantra_preview, mantra_rec,
serious_sound_full, serious_sound_preview, serious_sound_rec)
identified **scoring** as the load-bearing failure surface:

- Every positive (intra-group) pair produced recoverable signal:
  hash overlap between 35 and 2489, with mantra_full↔mantra_preview
  showing 95%+ (h, f1) coherence on the digital control pair.
- Every cross-group pair had hash overlap ≤ 10 and zero (h, f1)
  coherence — clean group separation at the hash level.
- The in-source default threshold `0.5` in `findExactMatchForSample`
  rejected every recording-vs-original pair (lowest positive ratio
  was mantra_rec↔mantra_preview at 0.013, ~38× below 0.5).

Two-stage scoring shipped as part of the fix: Stage 1 picks
candidates by `matching_hashes / sample_hash_count ≥
SAMPLE_MATCH_DEFAULT_THRESHOLD` (default 0.008 in dev,
operator-set in prod), then Stage 2 ranks candidates by the count of
matches in their dominant Δt bucket (bucket size from
`SAMPLE_MATCH_BUCKET_SECONDS`). The matcher throws when threshold is
neither explicit at the call site nor present in env — silent reliance
on the old 0.5 default is the bug we're closing.

#### Stage 2 (temporal coherence) algorithm

For each candidate preview produced by Stage 1, the matcher CROSS
JOINs the sample's and the preview's fingerprint rows sharing a hash,
generates `Δt = preview_position − sample_position` for each pair,
buckets at `SAMPLE_MATCH_BUCKET_SECONDS` (default 0.05 s), and counts
rows per bucket. The peak bucket count becomes the candidate's final
`match_score`; rows are ordered by that score. A
`SAMPLE_MATCH_PEAK_BUCKET_MIN` floor filters out candidates whose peak
fails to clear the noise floor (default 1 = effectively disabled).

#### Decisions ruled out (with diagnostic citations)

- **Extraction.** Cross-group hash overlap is ≤ 10 vs ≥ 35 for the
  weakest positive pair. The extractor produces usable signal in every
  positive case; weak rec→preview overlap is consistent with normal
  acoustic-capture noise, not a broken extractor. Documented gap:
  `(h, f1)` coherence drops to 0% for any pair involving the `.wav` rec
  (vs 40–95% for pure-`.mp3` pairs); likely a pydub/Panako preprocessing
  asymmetry. Tracked as a follow-up because Stage 2 stays hash-only.
- **Upload.** Diagnostic-endpoint vs local-CLI numbers were not in
  conflict for our fixtures; the existing upload path is sufficient
  to satisfy the binding regression.

#### Diagnostic-tool correctness fix

`blocks_to_seconds` in `panako_processor.py` used `2048 / 11025` (an
older Panako default) instead of the actual Panako 2.1 config
`128 / 16000` — a factor of 23.222× too large. Empirically verified
against every fixture's `(max_t1 × seconds_per_block)` vs its real
audio duration. Fix landed in this change; existing production
fingerprint rows have positions inflated by the same factor, which
was latent (matcher pre-fix ignored positions). A one-shot operator
migration ships at
`packages/back/migrations/manual/scale-fingerprint-positions.sql` —
run exactly once after deploying the analyser update.

### Fixture fingerprint re-extraction

The backend's hermetic regression test
(`packages/back/test/tests/admin/sample-matching-regression.js`)
reads fingerprints from `packages/back/test/fixtures/sample-matching/`
so CI does not need Panako installed. Re-extract those fixtures from
this directory whenever the analyser's Panako config changes:

```bash
cd analyser
source venv/bin/activate
rm -f panako_db/*.tdb
python3 -c "
import json, os
from panako_processor import extract_panako_fingerprints
OUT = '../packages/back/test/fixtures/sample-matching'
DATA = 'data'
for f in os.listdir(DATA):
    fps = extract_panako_fingerprints(os.path.join(DATA, f))
    base = os.path.splitext(f)[0]
    with open(os.path.join(OUT, base + '.json'), 'w') as fp:
        json.dump({'file': f, 'fingerprintCount': len(fps), 'fingerprints': fps}, fp, indent=0)
    print(f'{base}.json: {len(fps)} fingerprints')
"
```

Then re-run the back regression suite. Numbers may drift slightly
between runs (Panako is not byte-stable across LMDB sessions); the
regression assertions are written in terms of *rank order at threshold
0.008*, which is robust to those drifts.