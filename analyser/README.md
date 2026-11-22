# Instructions

Install pyenv with the following command: 

```brew install pyenv```

Install python 3.13 with the following command: 

```pyenv install 3.13```

Install ffmpeg, which the workers use to decode downloaded audio to WAV
(`audio_decode.py`):

```brew install ffmpeg```

Create a virtual environment with the following command: 

```python3 -m venv venv```

Activate the virtual environment with the following command: 

```source venv/bin/activate```

Install dependencies with the following command: 

```pip install -r requirements.txt```

Embeddings come from the shared `track_embedding` package
(github.com/gadgetmies/track-embedding, pinned by release tag in
`requirements.txt`; specification version `track-embedding/1`, stored as
`discogs_multi_embeddings-effnet-bs64-1`). The first worker that builds the
model downloads the ONNX Discogs-EffNet model (CC BY-NC-SA 4.0, see
`models/README.md`) into `models/`, or reads it from
`TRACK_EMBEDDING_MODELS_DIR` when set. Essentia and TensorFlow are no longer
needed.

Run the embedding tests (the conformance fixtures in
`fixtures/track-embedding-1` must match within cosine 0.99999):

```venv/bin/python -m pytest test_embedding.py test_embedding_service.py```

Initialise Postgres vector database

```brew install postgres```
```brew install pgvector```
```createdb multi-store-player-vector```
```createdb multi-store-player-vector-test```

Run the analyser:

```python3 main.py```

## Preview audio comes from the bucket

The stores rate-limit preview downloads, so the analyser no longer
downloads previews itself. The backend job `prefetchPreviewAudio` runs
every 10 minutes on the production backend (Railway). It downloads the
audio of Bandcamp and Beatport previews that still need an analysis into
the backend's storage bucket (`AUDIO_SAMPLE_STORAGE_*`), under
`preview-audio/<random uuid>.mp3`. Each preview is downloaded once for all
three workers. The job's store traffic is kept conservative:

- Bandcamp stream URLs are signed per track and expire. Every Bandcamp
  request, lookups and downloads alike (the mobile API's stream URLs are
  `bandcamp.com/stream_redirect` links), goes through the backend's
  Bandcamp client: 2 s between requests, as `bandcamp.py` does, sharing
  the backend's rate-limit pause with playback. Stream URLs are stored
  per preview and used until they are
  `BANDCAMP_STREAM_URL_REFRESH_AGE_DAYS` old (13 by default) or fail, so
  most tracks need no lookup; a lookup replaces the URLs of every track
  of the release.
- Beatport downloads go one at a time, at least
  `PREVIEW_AUDIO_DOWNLOAD_INTERVAL_MS` (default 1000) apart.
- A 429 or 403 pauses that store for 10 min, doubling up to 1 h.
- At most `PREVIEW_AUDIO_PREFETCH_MAX_STORED` (default 1000) files wait
  for analysis. A run lasts at most `PREVIEW_AUDIO_PREFETCH_MAX_RUN_MS`
  (default 8 min).
- Files larger than `PREVIEW_AUDIO_MAX_BYTES` (default 30 MB, about 32
  minutes at 128 kbps; capped below 64 MiB, where the storage client
  switches to a multipart upload the Railway bucket cannot complete) are
  not prefetched, so long recordings such as DJ mixes are not analysed
  from the bucket. They are not marked missing and still play.

The preview queues serve the stored file as `audio_url`
(`/api/storage/<key>`, resolved against `FOMOPLAYER_API_URL`). The
workers ask for stored previews only (`audio=stored`), so they never
contact a store and can run at full speed. Once a preview has its
fingerprint, its embedding for the production model and (for Bandcamp)
its waveform, or is marked missing, the backend deletes its file.

An empty queue now means "nothing prefetched is waiting", not that every
preview is analysed, so `analyse_all.sh` keeps its workers waiting for
the next prefetch run instead of stopping (see `--idle-wait`). Pass `--direct-download` to `waveform.py`,
`main.py`, `panako_processor.py` or `analyse_all.sh` to download from the
stores as before, e.g. against a local backend without the job. Against
a backend without the job the workers fall back to downloading from the
stores on their own, because no `audio_url` is served.

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
| `--previews`            | Spawn the `analyse-previews` window (see "Combined preview worker" below). With `--direct-download` or `--separate-workers`: the `fingerprint-previews`, `embedding-previews`, `waveform-previews` windows instead. |
| `--audio-samples`       | Spawn `fingerprint-samples` window.                                                   |
| `--purchased`           | Pass `-p true` to the `embedding-previews` worker (`main.py`). Separate workers only. |
| `--batch-size N`        | Pass `-b N` to every spawned worker (where supported).                                |
| `--model NAME`          | Pass `-m NAME` to `main.py`. Default `discogs_multi_embeddings-effnet-bs64-1`.        |
| `--session NAME`        | tmux session name. Default `analyser`.                                                |
| `--layout L`            | `windows` (default) — one tmux window per worker. `panes` — all workers as tiled panes in a single `workers` window with per-pane title bars. |
| `--no-waveform`         | Skip the `waveform-previews` worker (useful when the `WAVEFORM_STORAGE_*` object storage env vars are not configured; the bucket must be the backend's `AUDIO_SAMPLE_STORAGE_BUCKET_NAME`, set `WAVEFORM_STORAGE_REGION=auto` for a Railway bucket). |
| `--direct-download`     | Pass `--direct-download` to the preview workers: download from the stores instead of only taking previews whose audio the backend's `prefetchPreviewAudio` job stored in the bucket. Implies `--separate-workers`. |
| `--separate-workers`    | Run the three separate preview workers instead of `analyse-previews`. |
| `--fingerprint-workers N` | Parallel Panako processes: `--fingerprint-workers` of `analyse-previews`, `--workers` of `fingerprint-previews`. Default 4. |
| `--idle-wait SECONDS`   | When a worker finds its queue empty, wait this long and ask again instead of stopping (the backend adds prefetched audio every 10 minutes). Default `120`; `0` stops each loop once its queue is drained, the default with `--direct-download`. |
| `--skip-sanity-confirmation` | Pass `--skip-sanity-confirmation` through to `main.py` — embedding-collision warnings are logged but no longer block on a y/N prompt. Recommended for unattended drains. |
| `--score-after N`       | Separate workers only. Pass `--score-after N` through to `panako_processor.py --previews`. After every N successfully fingerprinted previews in one invocation, the worker pauses and re-scores all samples that have fingerprints, persisting results into `user_notification_audio_sample_match`. Only effective when `--batch-size >= N` (counter is per-invocation). |
| `--no-progress`         | Don't add the two progress status lines (see "Progress status lines" below).          |
| `--no-attach`           | Don't `tmux attach` at the end; print the attach command instead.                     |

### Window names

- `analyse-previews` — `analyse_previews.py --loop --idle-wait <--idle-wait>` (default for `--previews`)
- `fingerprint-previews` — `panako_processor.py --previews`
- `embedding-previews` — `main.py --loop --idle-wait <--idle-wait>`
- `waveform-previews` — `waveform.py`
- `fingerprint-samples` — `panako_processor.py --audio-samples`

The embedding worker runs with `--loop`, so it loads the model once and
keeps processing batches; with `--idle-wait` it also waits for the next
prefetch run itself, model still loaded, and only exits `2` when the
idle wait is `0`.

Each window's loop re-invokes its worker while it exits `0` and sleeps 5 s
and retries on any other non-zero status. When the worker exits `2`
(queue empty) the loop waits `--idle-wait` seconds (default 120) and asks
again, because the backend refills the queues with prefetched audio every
10 minutes; with `--idle-wait 0` (the default with `--direct-download`)
it breaks cleanly instead. Windows are created with
`remain-on-exit on`, so the pane stays visible with its final
scrollback after the loop ends — operators can review what the worker
last printed before closing the session.

### Progress status lines

The session gets two extra tmux status lines from `analysis_progress.py`:

```
bucket 960 · left 21417/139423
440/h · ETA 2d 1h
```

For the previews of the prefetched stores (Bandcamp, Beatport): unanalysed
previews whose audio is in the bucket, unanalysed previews in total out of
all previews, the analysis rate over about the last hour and the time left
at that rate. "Analysed" is the backend's `analysedCondition`
(`packages/back/routes/admin/preview-audio.js`); keep the query in sync.
The rate counts previews that became analysed, so new previews arriving do
not hide progress; it reads `…` for the first ten minutes.

The script reads the production database read-only, at most once every five
minutes (`--refresh`); in between it prints the cached counts from
`$TMPDIR/fomoplayer-analysis-progress-<uid>.json`. The database URL comes
from `ANALYSIS_PROGRESS_DATABASE_URL`, or else from `railway variables` for
the `pgvector` service (`ANALYSIS_PROGRESS_RAILWAY_ENVIRONMENT`, default
`production`), run in this directory. When a refresh fails the last counts
are shown with `(stale)`. Run it by hand:

```bash
venv/bin/python analysis_progress.py              # one line
venv/bin/python analysis_progress.py --refresh 0  # ask the database now
```

### `exit(2)` convention for empty queues

`main.py`, `panako_processor.py`, and `waveform.py` now exit with status
`2` when their "next batch" backend endpoint returns an empty list, and
status `0` after processing a non-empty batch. Other non-zero statuses
mean unrecoverable error. `analyse_all.sh`'s per-window loop uses this
to distinguish "empty" from "error" — log-line parsing is no longer
needed. With prefetched audio an empty queue is usually temporary, so the
loop waits and asks again (`--idle-wait`) rather than stopping.

## Combined preview worker

`analyse_previews.py` analyses the previews whose audio the backend
stored. The separate workers each downloaded and decoded every stored
preview; this one reads `GET /admin/preview-analysis`, which lists stored
previews with the analyses each still needs (`needs_fingerprint`,
`needs_embedding`, `needs_waveform`), downloads and decodes each preview
once, and runs only the analyses it needs on that one WAV.

The analyses run at the same time, each at its own pace, not in lockstep:

- embedding: one process, the model loaded once;
- waveform: one process (it needs the `WAVEFORM_STORAGE_*` variables, or
  pass `--no-waveform`);
- fingerprints: `--fingerprint-workers` processes (default 4). A free
  process takes every WAV ready for fingerprinting, up to
  `--fingerprint-chunk` (default 8), into one Panako run, so Java starts
  once per chunk; when fingerprinting falls behind, its chunks fill up.

A WAV is deleted as soon as every analysis that needs it is done. New
downloads wait while more than `--max-in-flight` previews (default 16)
are between download and deletion or their WAVs exceed
`--max-decoded-mb` (default 1024). The run therefore takes about as long
as its slowest analysis, like the separate workers, with one download and
one decode per preview instead of up to three.

Results equal the separate workers': the WAV is decoded the same way, and
fingerprints still read at most `PREVIEW_MAX_DURATION_S` of it (the WAV
is truncated, which gives the same samples as a capped decode).
Embeddings, missing previews and waveforms are reported in batches at
least every 30 s (one request each, resent entry by entry if it fails);
fingerprints are uploaded per preview as before. A failed download or
analysis is retried after 10 minutes; a preview that fails to decode,
or whose waveform fails, three times is reported missing.

| Flag | Effect |
|------|--------|
| `--loop` / `--idle-wait S` | As for `main.py` below: keep going, and on an empty queue exit `2` or wait `S` seconds. |
| `-b N` | Previews fetched at a time (default 20). |
| `--download-workers N` | Parallel downloads and decodes (default 4). |
| `--fingerprint-workers N`, `--fingerprint-chunk N` | See above. |
| `--max-in-flight N`, `--max-decoded-mb MB` | Disk bound, see above. |
| `--no-waveform` | Skip waveforms. |
| `--work-dir DIR` | Where downloads and WAVs go (default a temporary directory). |

It does not handle `--direct-download`, Bandcamp stream lookups, audio
samples or `--score-after`: use the separate workers for those.

`bench_preview_workers.py` runs the separate workers and the combined one
on the same generated previews against a stub backend and prints the
time, downloads and peak disk of each. Panako is replaced by a stand-in
burning CPU (`--panako-*` flags) unless `--real-panako` is given. Don't
run it next to live workers: the separate fingerprint worker clears
`analyser/downloads/`.

## Embedding and waveform throughput

`main.py` (previews) and `waveform.py` download and decode the next
previews on background threads while the model runs, or while a
waveform is drawn, and still process and report them in queue order.

| Flag | Worker | Effect |
|------|--------|--------|
| `--loop` | `main.py` | Keep the model loaded and process batches until the queue is empty, then exit `2`. Without it, one batch per run as before. |
| `--idle-wait SECONDS` | `main.py` | With `--loop`: on an empty queue, wait and ask again instead of exiting. `0` (default) exits `2`. |
| `--download-workers N` | `main.py`, `waveform.py` | Parallel downloads of previews stored in our bucket (default 4). Previews fetched from a store (Bandcamp lookups, `--direct-download`) are always fetched one at a time on one thread, so store traffic is unchanged. |

Each downloaded file is deleted as soon as it is decoded, and at most
`N + 1` decoded previews wait ahead of the one being processed, so a
worker needs up to about `(N + 2) × 60 MB` of temporary disk for full
Bandcamp tracks (about 360 MB with the default 4).

`main.py` reports each batch's embeddings and missing previews in one
`POST /admin/analyse`. That endpoint fails the whole list if one entry
fails, so on an error the worker resends the entries one per request
and only the failing ones stay queued.

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

The scoring pass issues one
`POST /admin/exact-match/audio-samples/matches` with no body, which
tells the server to score every sample with fingerprints. The server
iterates samples sequentially, calls `findExactMatchForSample` and
persists each sample's matches into
`user_notification_audio_sample_match`; the response is a per-sample
summary the worker prints. A 404 means the endpoint is not deployed
yet — the worker logs a clear message and skips the scoring pass.

Results are persisted to `user_notification_audio_sample_match`
server-side; inspect via `fomoplayer query` or the user-facing
Settings page after a scoring pass.

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

## Embedding service (uploaded samples)

Uploaded notification samples are embedded automatically: the backend job
`embedNotificationAudioSamples` (admin Jobs, every 10 minutes and after each
upload) sends each pending sample's audio to `embedding_service.py` and stores
the vector it returns. The service holds no Fomo Player credentials and never
calls the backend; both `main.py` and the service compute vectors with
`embedding.py`, so samples and previews stay comparable.

| Endpoint | Result |
|---|---|
| `GET /health` | `200 {"status": "ok", "model": ...}` |
| `POST /embed` (raw audio body; FFmpeg detects the format) | `200 {"model": ..., "embedding": [1280 floats]}`; `401` without `Authorization: Bearer <token>`; `413` over the size limit; `422 {"error": ...}` for audio that cannot be decoded or is too short; `500 {"error": ...}` when embedding fails for another reason (the sample stays queued) |

Environment: `EMBEDDING_SERVICE_TOKEN` (required; the service refuses to
start without it), `PORT` (default 8080), `EMBEDDING_SERVICE_MAX_BYTES`
(default 100 MB). The image downloads the model at build time.

Run it locally:

```bash
docker build -t fomoplayer-embedding analyser
docker run -p 8080:8080 -e EMBEDDING_SERVICE_TOKEN=dev-token fomoplayer-embedding
curl -H "Authorization: Bearer dev-token" -H "Content-Type: audio/mpeg" \
  --data-binary @sample.mp3 localhost:8080/embed
```

The backend finds it through `EMBEDDING_SERVICE_URL` and
`EMBEDDING_SERVICE_TOKEN`; without them the job reports itself skipped. On
Railway it runs as its own service built from `analyser/Dockerfile` with no
public domain, and the backend reaches it on the private network.

`main.py --audio-samples` still works for embedding samples by hand.

## Java runtime for Panako

`panako` is a bash launcher that invokes bare `java`. On macOS the Apple
`/usr/bin/java` stub only works while a JDK is registered under
`/Library/Java/JavaVirtualMachines`, and that registration has been lost
on reboot/OS update before (2026-10-14), making every `panako store` fail
instantly with rc=1 and an empty error. Homebrew's OpenJDK does not
register itself; prepend it to `PATH` for every worker invocation:

```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
java -version   # must print an OpenJDK version, not "Unable to locate a Java Runtime"
```

`panako_processor.py` exits non-zero when an entire batch fails so driver
loops back off instead of silently refetching the same batch forever.

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
is not the suspect.** Inspect the audio conversion (`audio_decode.to_wav`:
sample rate / channels) or the Panako version before looking at storage or scoring.

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
buckets at `SAMPLE_MATCH_BUCKET_SECONDS` (default 0.5 s), and counts
rows per bucket. The peak bucket count becomes the candidate's final
`match_score`; rows are ordered by that score. A
`SAMPLE_MATCH_PEAK_BUCKET_MIN` floor filters out candidates whose peak
fails to clear the noise floor (default 3 — drops the peak-count-1/2
noise rows that otherwise fill the persisted match set).

#### Decisions ruled out (with diagnostic citations)

- **Extraction.** Cross-group hash overlap is ≤ 10 vs ≥ 35 for the
  weakest positive pair. The extractor produces usable signal in every
  positive case; weak rec→preview overlap is consistent with normal
  acoustic-capture noise, not a broken extractor. Documented gap:
  `(h, f1)` coherence drops to 0% for any pair involving the `.wav` rec
  (vs 40–95% for pure-`.mp3` pairs); likely a WAV-conversion/Panako preprocessing
  asymmetry (measured when conversion still went through pydub, which
  `audio_decode.py` reproduces sample for sample). Tracked as a follow-up because Stage 2 stays hash-only.
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

### Production follow-up (2026-10-11): why the uploaded recordings still didn't match

Investigation of the production uploads (`nitepunk.mp3` = sample 6 =
`data/mantra_rec.mp3`, `serious sound.wav` = sample 10 =
`data/serious_sound_rec.wav`) found three compounding causes, none of
them in the hermetic fixtures' happy path:

1. **The 2026-05-24 position-rescale migration was never run in
   production.** Samples 6/9/10/11/12 and 21 previews (all extracted
   2026-01-25/27) still had positions inflated 23.222×. Stage 2 Δt
   coherence is destroyed by mixed scales: sample 10 scored 4 against
   its correct preview; with positions rescaled the same pair peaks
   at 29. The original blanket script is now UNSAFE (the corpus is
   mixed-scale) — run the selective successor instead, exactly once:
   `packages/back/migrations/manual/rescale-pre-fix-fingerprint-positions.sql`.
2. **`SAMPLE_MATCH_BUCKET_SECONDS` 0.05 s was too tight for acoustic
   recordings.** Clock drift splits a true peak across neighbouring
   buckets (observed: 8+6 and 8+7 in adjacent 0.05 s buckets). The
   in-source default is now 0.5 s, validated against the full 36k
   fingerprinted-preview corpus: serious_sound peak 29 (noise ≤ 4),
   nitepunk-vs-its-preview peak 5 (noise ≤ 3), both rank 1.
3. **The expected previews were not fingerprinted.** Only ~36k of
   254k previews have fingerprints, and the Beatport preview of
   Noisia – Mantra (Nitepunk Remix) (store__track_preview_id
   90707329) has none — no scorer change can surface a preview that
   is not in the index. Drain the backlog with
   `./analyse_all.sh --previews`.

Also: `SAMPLE_MATCH_PEAK_BUCKET_MIN` now defaults to 3, so the
score-1/2 noise rows that filled `user_notification_audio_sample_match`
are no longer persisted.

**Known limitation (not a bug):** a recording only matches a preview
if the recorded section overlaps the preview excerpt. `mantra_rec`
peaks at 159 against the full track but only 4–5 against the 2-minute
Beatport preview — most of the recorded window simply is not in the
excerpt. Bandcamp previews are full tracks, so this limitation is
Beatport/Spotify-specific.

**Operator runbook to make the known recordings match, in order:**

1. Run `rescale-pre-fix-fingerprint-positions.sql` (once).
2. Deploy the backend with the new scoring defaults (or set
   `SAMPLE_MATCH_BUCKET_SECONDS=0.5`, `SAMPLE_MATCH_PEAK_BUCKET_MIN=3`).
3. Fingerprint the missing previews: `./analyse_all.sh --previews`.
4. Re-score everything: `POST /api/admin/exact-match/audio-samples/matches`
   with an empty body (or let `--score-after` do it during the drain).

### Drain failure modes seen in production (2026-10-14/15)

Both bit silently — the drain looked alive while uploading nothing.
Check `MAX(store__track_preview_fingerprint_extracted_at)` against the
wall clock when in doubt; it should trail by minutes, not hours.

1. **Hung HTTP calls pinned every worker.** None of the pipeline's
   HTTP calls had timeouts, so one silently-dropped connection blocks
   a worker forever. Seen twice: stalled Beatport CDN downloads
   (`urllib.request.urlretrieve`, 4 workers frozen 6.5 h) and dropped
   backend upload connections (`requests.post`, 4 workers frozen
   9+ h with all four stuck on ESTABLISHED sockets the server had
   forgotten). Every download, fetch and upload now carries a
   timeout (downloads retry 3×; a timed-out upload is retried via
   the without-fingerprint queue).
2. **Zero-fingerprint previews poison the queue.** Some Beatport
   previews are ~3-second stubs; Panako extracts nothing from them.
   The deployed backend only wrote the `*_fingerprint_meta` row when
   fingerprints existed, so such previews re-entered the
   newest-first `without-fingerprint` queue on every fetch (~6 per
   200-batch observed — enough to wedge the drain within a day).
   Fixed twice over:
   - backend `upsertPreviewFingerprints` now upserts the meta row
     (count 0) even for empty uploads — takes effect on next deploy;
   - until then `panako_processor.py` records them in
     `analyser/zero_fingerprint_previews.txt`, over-fetches the batch
     by the skiplist size and filters them out. The skiplist is inert
     once the backend fix is live.
3. **A multi-hour track wedges the Panako JVM forever (2026-10-16,
   Bandcamp).** Bandcamp previews are full tracks; a ~2 h track makes a
   365 MB wav whose fingerprints exhaust Panako's 256 MB heap. The decode
   aborts mid-file, TarsosDSP's `PipeDecoder` leaves non-daemon threads
   waiting on an ffmpeg child that is blocked writing to a pipe nobody
   reads any more, so the JVM never exits — and the worker's untimed
   `subprocess.run` waited on it indefinitely (4.5 h stall observed;
   `jstack` shows the main thread in `DestroyJavaVM` and a "Decoding
   Pipe" thread in `Process.waitFor`). The OOM is in jgaborator's
   `gaborTransform` (`~/.panako/log/panako_stderr.log` has the traces —
   the wrapper sends JVM stderr there), which buffers the whole file's
   spectral coefficients on the heap, so heap need grows with duration
   and ~15+ min of audio blows 256 MB. Fixed three ways in
   `extraction.py`:
   - `_run_panako` sets `_JAVA_OPTIONS` (which outranks the wrapper's
     command-line `-Xmx256m`) to `PANAKO_JAVA_OPTIONS`, default
     `-Xmx1g` — the actual cure: the very file that wedged forever
     stores in 12 s at 1 g (46k fingerprints);
   - `_preview_to_wav` caps decode length at `PREVIEW_MAX_DURATION_S`
     (default 900 s; env-overridable) — bounds heap use, wav disk
     footprint and upload payloads; content past the cap is
     unmatchable, which is the accepted trade-off;
   - every panako invocation goes through `_run_panako`, which runs the
     command in its own session group and `killpg`s the whole
     wrapper+JVM+ffmpeg tree after `PANAKO_TIMEOUT_S` (default 1800 s).
     A plain `subprocess.run(timeout=…)` is NOT enough: it kills only
     the `panako` bash wrapper, the JVM keeps the pipe fds open and
     `communicate()` still never returns.

   Without the timeout net, a single such track poisons the drain
   permanently: it never gets a meta row, so the queue/export re-serves
   it every batch and each encounter stalls a worker again.
4. **Zero-fingerprint sample packs fake a DRAINED Bandcamp queue
   (2026-10-17).** Bandcamp sells sample packs whose "tracks" are
   drum one-shots of a few hundred milliseconds; Panako extracts zero
   fingerprints from them, and until the `upsertPreviewFingerprints`
   fix deploys the backend writes no meta row for empty uploads, so
   they are re-exported every batch. The worker skiplists them, but
   `drain_bandcamp.sh`'s export is ordered by release_url — one such
   release eventually occupied all 50 slots, the worker filtered every
   job and returned rc=2 ("empty queue"), and the loop exited DRAINED
   with ~53k previews left. Fixed three ways:
   - the 57 skiplisted previews got count-0 meta rows written directly
     (panako had genuinely produced zero fingerprints for each);
   - the export now excludes ids in `zero_fingerprint_previews.txt`;
   - `process_previews` in jobs-file mode returns 1 (back off, retry),
     not 2 (drained), when jobs existed but all were skiplisted.
5. **Upload congestion collapse under full-track payloads
   (2026-10-17).** The server keeps executing the upsert's bulk INSERT
   after its 25 s response timeout; the worker sees the 500 and fires
   its next upload, stacking another INSERT on the still-running one.
   Beatport payloads (~4k fingerprints) stayed fast enough that this
   never compounded, but Bandcamp full tracks (10–70k) pushed single
   INSERTs into tens of seconds against the 31 GB fingerprint table,
   and 4 workers snowballed to 10+ concurrent INSERTs — each slowing
   the others until some crossed the backend's 180 s
   `STATEMENT_TIMEOUT` and rolled back (losing the work and re-queuing
   the preview), with hourly throughput halving. Fix:
   `upload_preview_fingerprints` serializes uploads across all worker
   processes with an `flock` on `analyser/.upload_lock`, so at most
   one INSERT is in flight from this machine; extraction still runs in
   parallel. The proper backend fix remains moving fingerprint uploads
   and bulk scoring off the request path (background job / per-route
   timeout).

### Bandcamp previews (2026-10-16)

Bandcamp previews (~54k) store no URL — their stream URLs expire, so they
are resolved on demand from the release page — which is why the original
drain never served them. They are also full tracks, so expect ~4–8k
fingerprints per preview (LOFI-equivalent 128kbps mp3s of full tracks)
and correspondingly bigger uploads.

Two paths serve them:

- **Deployed backend (after next deploy):** `queryPreviewsWithoutFingerprint`
  now includes URL-less Bandcamp previews with `store_track_id` (the
  store's own track id) and `release_url`; `panako_processor.py` resolves
  the stream URL per preview via `bandcamp.py` (rate-limited, one page per
  release, sequential in the main process), marks unstreamable previews
  missing via `POST /admin/analyse`, and defers transient failures.
- **Until the deploy:** `./drain_bandcamp.sh` exports the job list straight
  from the production DB (ordered by release_url to maximise the
  resolver's per-release page cache) and feeds it to
  `panako_processor.py --previews --jobs-file bandcamp_jobs.json`.

### Bandcamp stream URL cache (2026-11-15)

With `--direct-download` the workers still resolve Bandcamp stream URLs
from release pages. `bandcamp.py` keeps the stream URL of every track of
each release it looks up in `bandcamp_stream_urls.json` (override with
`BANDCAMP_STREAM_CACHE`), shared by the workers and across runs. A
release-page URL (`*.bcbits.com/stream/...`) carries its expiry in `ts`,
24 h after it is issued, and is used until 15 minutes before then; a
`bandcamp.com/stream_redirect` URL is used for
`BANDCAMP_STREAM_URL_REFRESH_AGE_DAYS` (13 by default). A refused or failed
download forgets the URL, so the next attempt looks the release up again.
`main.py` keeps a preview whose cached URL failed in the queue instead of
marking it missing.

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