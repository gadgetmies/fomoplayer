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
