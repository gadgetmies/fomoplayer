# Gate results (task 1.2)

The gate (design D1): the analyser may compute embeddings with the `track_embedding` package only when its vectors
match stored ones at cosine ≥ 0.99999 for at least 200 previews and 20 notification samples. The measurement script is
`analyser/compare_stored_embeddings.py`.

## Against production's stored vectors: not run yet (owner action)

It needs read access to production's database and the back end's storage redirect. The owner runs it with
`DATABASE_URL` set to production (the script opens every transaction read-only) and `FOMOPLAYER_API_URL`:

```sh
cd analyser
DATABASE_URL=… FOMOPLAYER_API_URL=https://fomoplayer.com/api venv/bin/python compare_stored_embeddings.py --out /tmp/embedding-gate
```

## Proxy runs

No production data was used. Stand-ins for stored vectors were made by the analyser's former Essentia pipeline (base
commit c90c42983, the code that made every stored vector) and loaded into a scratch copy of the schema; the script ran
end to end against it: 200 real Beatport previews (the preview-vs-full-track research change's downloads: MP3,
44.1 kHz and 32 kHz, stereo) and 22 notification-sample stand-ins cut from other previews in MP3, AAC (M4A), WAV
16/24-bit and 32-bit float, FLAC 22.05 and 96 kHz and Opus, at 22.05–96 kHz, mono and stereo.

### 2026-11-23, track-embedding v1.0.1: passed

- Previews: 200 compared, minimum cosine 0.99999999999991, median 0.99999999999996.
- Samples: 22 compared, minimum 0.99999997653 (32-bit float WAV, which Essentia read at full precision and the
  specification decodes to 16-bit), median 0.99999999999995.

### 2026-11-22, track-embedding v1.0.0: failed on one preview

One preview in 200 reached only 0.99997371. The decoded samples were identical bit for bit and the per-patch vectors
agreed (≥ 0.99999976), but Essentia embeds one patch fewer: it drops a last 128-frame patch that ends exactly on the
last front-end frame (`ceil((frames − 128) / 62)` patches), while v1.0.0 counted `1 + (frames − 128) // 62`. The two
differ for one audio length in 62. v1.0.1 counts patches as Essentia does and adds the conformance fixture
`wav-16000-mono-190-frames`, which the analyser's copied fixtures include.

## Production run, 2026-11-23: 196 of 200 previews and 6 of 6 samples pass; the 4 others are stale stored vectors

Run read-only against production with track-embedding v1.0.1 (`compare_stored_embeddings.py`, seed 0.42).

- Previews: 200 compared, median cosine 0.999999999999979; **4 below the gate**: 58373283 (0.1839), 47746635 (0.9781),
  55605362 (0.9980), 61351399 (0.99986). Every other preview is at ≥ 0.9999999934.
- Samples: production holds only 6 notification samples with embeddings (the gate asked for 20); all 6 pass (minimum
  0.9999999934).

Cause of the 4: the stored vectors do not describe the audio the preview URL serves today. Run on the same downloaded
files, the former Essentia pipeline (master c90c42983, which made every stored vector) and the package agree at cosine
1.0000000 for all four, and both differ from the stored vector by exactly the same amount. All four were computed on
2025-01-20/21 (125 other previews computed that month pass), each track has one preview, and the URL is a permanent one,
so either the store replaced the audio behind the URL or that first batch was made by an earlier pipeline. The
package is not the cause. Not decided here: whether the gate counts these as passes, and whether stored vectors
should be recomputed (the analyser switch to the package does not recompute existing rows).
