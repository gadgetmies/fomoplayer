# Analyser benchmark

Measures how fast a machine runs the three preview analyses (embedding,
waveform, fingerprint) and projects how many tracks a day it can keep up
with. Built for checking whether a NAS can run the workers without getting in
the way of file serving, but it runs on any x86-64 machine with Docker.

The benchmark does the same work as the production workers (`main.py`,
`waveform.py`, `panako_processor.py`) on local files: it decodes each MP3 to
WAV with pydub, runs the Discogs-EffNet model, draws the waveform PNG and
fingerprints the batch with Panako in one call. It does not talk to the Fomo
Player API or to object storage. Every stage runs on one thread, so the result
is per core.

## Running it on a Synology NAS (Container Manager)

1. Copy the whole `analyser/` folder (including `models/`) to the NAS, e.g.
   `/volume1/docker/fomoplayer-analyser`.
2. Container Manager → **Project** → **Create**: name it, set the path to the
   `benchmark/` folder inside the copy, and choose the existing
   `compose.yaml`. Building the first time takes a while: it compiles Panako
   and installs TensorFlow.
3. When the container exits, open its log. The summary at the end is the
   result.

`compose.yaml` gives the container two cores at the lowest CPU priority and
3 GB of memory, the limits a production worker would get on the NAS. To try
your own music instead of synthetic tracks, uncomment the `volumes` and
`command` lines and point them at a folder of MP3s.

## Running it with plain Docker

```bash
cd analyser
docker build -f benchmark/Dockerfile -t fomoplayer-analyser-bench .
docker run --rm --cpus 2 --memory 3g fomoplayer-analyser-bench
docker run --rm --cpus 2 --memory 3g -v /path/to/mp3s:/audio:ro \
  fomoplayer-analyser-bench --audio-dir /audio
```

Outside Docker, from `analyser/` with the analyser virtualenv active:
`python benchmark/bench.py` (needs `panako` on `PATH`, or pass `--skip-panako`).

## Reading the result

```
CPU seconds per minute of audio (24 min analysed, one core):
  embedding      1.85
  waveform       0.23
  fingerprint    …
  all            …
Tracks per day, all three analyses, if the cores are kept busy:
  2 core(s): ~… two-minute previews or ~… six-minute tracks
```

Compare the tracks-per-day line with the number of new previews a day
(query 3 in `production-speed.sql`). Beatport previews are about two minutes;
Bandcamp previews are full tracks, typically five to seven minutes.

## Comparing with production

`production-speed.sql` holds read-only queries for `fomoplayer query` (one
statement per call) that work out how fast the analyser has run in
production, from the timestamps the backend writes when it saves an embedding
(`store__track_preview_embedding_updated_at`) or a fingerprint set
(`store__track_preview_fingerprint_extracted_at`). Waveforms have no
timestamp, so they cannot be measured this way. The gaps are throughput with
the other workers running alongside, and the fingerprint worker runs four
processes in parallel by default.
