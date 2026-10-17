# EffNet perception research (`epr`)

Research tooling for the OpenSpec change `effnet-perception-research`: what `discogs_multi_embeddings-effnet-bs64-1`
treats as similar, measured on full tracks from the AKIN catalog. The design and the reasons behind it are in
`openspec/changes/effnet-perception-research/`, and the results are in `FINDINGS.md` there.

The tooling reads the AKIN catalog read-only (through a snapshot) and writes only under `EPR_OUT`, default
`/Volumes/DJ/research/effnet-perception`. Nothing touches production or the catalog itself.

## Setup

```sh
cd analyser/research/effnet-perception
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
```

It also needs these on the PATH: `ffmpeg`, `sox` and `rubberband` (the last only for one control). Stem separation
runs Demucs from a venv that has torch; set `DEMUCS_PYTHON`, which defaults to `../dj-automation/.venv/bin/python`.

The optional style representation needs `discogs-effnet-bs64-1.pb` and its `.json` from
<https://essentia.upf.edu/models/feature-extractors/discogs-effnet/>, saved into `$EPR_OUT/models/`. Its licence
terms are its own, so it is never committed.

## Running

```sh
./run_all.sh                                   # every step in order; reruns resume where they stopped
.venv/bin/python -m epr changes --limit 2      # one step, first N items only (trial)
EPR_OUT=/tmp/epr-trial .venv/bin/python -m epr sample
.venv/bin/python -m pytest -q tests            # verifiers, mashup maths, read-only guard, sampler
```

Steps, in order:

| Step | What it does |
|---|---|
| `snapshot` | Copies the catalog read-only |
| `sample` | Draws seeded, stratified samples |
| `embed-full` | Per-patch embeddings of full tracks |
| `representations` | Part 1; picks the Part 2 unit |
| `style` | Discogs style probabilities |
| `stems` | Demucs on the unit region |
| `changes` | Part 2 audio changes and stem removal |
| `swaps`, `offsets` | Stem swaps and stem offsets |
| `correlations` | Part 3 |
| `report` | `summary.json` and the charts |
| `page` | The listening page, `$EPR_OUT/page/index.html` |

Each step writes these files under `$EPR_OUT/<step>/`:
- `results.csv`;
- `failures.csv`, one row per failed item;
- `summary.json`;
- `done.txt`, the finished keys.

A failed item is recorded and the step exits non-zero; it is never silently skipped.

## Pitfalls

**The stretch engine can move the embedding more than the tempo does.** Before trusting any time-stretch or pitch
shift, embed a near-zero control (0.1 % tempo, 0.02 semitones) with the same engine. A clean engine moves the
embedding by about 0.0005 (cosine distance); anything larger is the engine's own artefact. Measured on 300 tracks:
- sox WSOLA (`tempo -m`, `pitch`): 0.0004;
- Rubber Band R3 (`--fine`): 0.055, almost as much as a real 8 % stretch (0.05–0.10);
- Rubber Band R2: 0.008–0.04 (three-track trial).

The pipeline therefore uses sox for tempo, pitch and the swap stretching, and keeps one R3 control to document the
effect.

**macOS `._*` files on the output volume.** `/Volumes/DJ` is FAT32 (exFAT behaves the same). FAT32 cannot store
extended attributes, so whenever macOS writes a file there that has any (a quarantine flag, Finder metadata, a file
written by some tools or copied with `cp`), it also creates an AppleDouble companion named `._<name>` in the same
directory. These are not audio or NumPy files, so a glob such as `*.wav` or `*.npz` picks them up and the reader
crashes (ffmpeg: "Invalid data found when processing input"; `int(p.stem)` on `._123`). Every directory listing in
`epr` skips names that start with `._`; do the same in new code. To clean a directory by hand: `dot_clean -m <dir>`
or `find <dir> -name '._*' -delete`. FAT32 is also slow with many small files, so steps record finished items in one
append-only `done.txt` instead of a marker file per item, and it cannot hold files over 4 GB.

**The live AKIN catalog.** AKIN keeps `tracks.akincatalog` open and writes to it (WAL). A loop of `sqlite3 -readonly`
calls (`.schema` and `count(*)` across several tables, including the sqlite-vec `vec0` table) once hung for over two
minutes; the cause was not established. Single queries under `timeout 20` worked. `epr` never queries the live file
beyond copying it: `snapshot` takes a consistent copy with SQLite's backup API, and every step reads the copy.
