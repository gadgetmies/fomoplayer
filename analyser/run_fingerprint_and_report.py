"""Fingerprint every reachable sample + preview in the dev DB, populate
`user_notification_audio_sample_match` with everything Panako scores
above the prod Stage-1 threshold, and write a markdown report
comparing the discovered matches against the curated ground-truth rows
already in the table.

This is a one-shot operator script — it bypasses the OAuth/HTTP layer
that `panako_processor.py` uses and writes directly to the DB. Safe
because it targets the local `multi-store-player` database only.

Usage:
    cd analyser
    source venv/bin/activate
    python run_fingerprint_and_report.py [--skip-fingerprint] [--report-only]

Flags:
    --skip-fingerprint: assume fingerprints already in DB; jump to scoring
    --report-only: assume match table already populated; just write the report
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
import traceback
from pathlib import Path

import psycopg2
import psycopg2.extras
from pydub import AudioSegment

# Panako CLI needs a JRE on PATH. macOS Homebrew installs `openjdk` keg-only,
# so unless the user has manually linked it the `java` binary isn't on the
# default PATH and Panako exits 1 with no diagnostic. Prepend brew's openjdk
# bin to PATH if it exists; harmless on non-Homebrew systems.
_BREW_JAVA = '/opt/homebrew/opt/openjdk/bin'
if os.path.isdir(_BREW_JAVA) and _BREW_JAVA not in os.environ.get('PATH', ''):
    os.environ['PATH'] = _BREW_JAVA + os.pathsep + os.environ.get('PATH', '')

# Local imports — the analyser venv resolves these from this directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extraction import (  # noqa: E402
    download_and_manage_file,
    ensure_downloads_directory,
    extract_panako_fingerprints,
)

DB_DSN = os.environ.get('DATABASE_URL', 'postgresql://localhost/multi-store-player')
STAGE1_THRESHOLD = float(os.environ.get('SAMPLE_MATCH_DEFAULT_THRESHOLD', '0.008'))
BUCKET_SECONDS = float(os.environ.get('SAMPLE_MATCH_BUCKET_SECONDS', '0.05'))
PEAK_BUCKET_MIN = int(os.environ.get('SAMPLE_MATCH_PEAK_BUCKET_MIN', '1'))
REPORT_PATH = Path(__file__).parent.parent / 'openspec' / 'changes' / 'suspected-sample-matches-display' / 'PANAKO-RESULTS.md'

# ----------------------------- helpers ------------------------------------


def db_connect():
    return psycopg2.connect(DB_DSN)


def fetch_samples_to_fingerprint(conn):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT s.user_notification_audio_sample_id AS id,
                   s.user_notification_audio_sample_url AS url,
                   s.user_notification_audio_sample_filename AS filename
            FROM user_notification_audio_sample s
            LEFT JOIN (
                SELECT user_notification_audio_sample_id
                FROM user_notification_audio_sample_fingerprint
                GROUP BY user_notification_audio_sample_id
            ) fp USING (user_notification_audio_sample_id)
            WHERE fp.user_notification_audio_sample_id IS NULL
            ORDER BY s.user_notification_audio_sample_id
        """)
        return list(cur.fetchall())


def fetch_previews_to_fingerprint(conn):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT p.store__track_preview_id AS id,
                   p.store__track_preview_url AS url
            FROM store__track_preview p
            LEFT JOIN (
                SELECT store__track_preview_id
                FROM store__track_preview_fingerprint
                GROUP BY store__track_preview_id
            ) fp USING (store__track_preview_id)
            WHERE fp.store__track_preview_id IS NULL
              AND p.store__track_preview_url LIKE 'http%'
            ORDER BY p.store__track_preview_id
        """)
        return list(cur.fetchall())


def to_wav_if_needed(downloaded_path, kind, file_id, downloads_dir):
    """Mirror panako_processor.py: mp3 → wav, wav passthrough, anything else
    raises so the caller can skip the row."""
    file_ext = os.path.splitext(downloaded_path)[1].lower()
    if file_ext in ('.mp3', '.mpeg', '.lofi', ''):
        # Beatport's .LOFI files are mp3-format despite the extension.
        sound = AudioSegment.from_file(downloaded_path)
        wav_filename = os.path.join(downloads_dir, f"{kind}_{file_id}.wav")
        sound.export(wav_filename, format='wav')
        if not os.path.exists(wav_filename) or os.path.getsize(wav_filename) == 0:
            raise RuntimeError(f"Wav conversion failed: {wav_filename}")
        return wav_filename
    if file_ext == '.wav':
        return downloaded_path
    raise RuntimeError(f"Unsupported file format: {file_ext}")


def insert_sample_fingerprints(conn, sample_id, fingerprints):
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM user_notification_audio_sample_fingerprint WHERE user_notification_audio_sample_id = %s",
            (sample_id,),
        )
        if fingerprints:
            psycopg2.extras.execute_batch(
                cur,
                """INSERT INTO user_notification_audio_sample_fingerprint
                       (user_notification_audio_sample_id,
                        user_notification_audio_sample_fingerprint_hash,
                        user_notification_audio_sample_fingerprint_position,
                        user_notification_audio_sample_fingerprint_frequency_bin)
                   VALUES (%s, %s, %s, %s)""",
                [(sample_id, fp['hash'], fp['position'], fp.get('f1')) for fp in fingerprints],
                page_size=500,
            )
            cur.execute(
                """INSERT INTO user_notification_audio_sample_fingerprint_meta
                       (user_notification_audio_sample_id,
                        user_notification_audio_sample_fingerprint_count,
                        user_notification_audio_sample_fingerprint_extracted_at)
                   VALUES (%s, %s, NOW())
                   ON CONFLICT (user_notification_audio_sample_id) DO UPDATE
                     SET user_notification_audio_sample_fingerprint_count = EXCLUDED.user_notification_audio_sample_fingerprint_count,
                         user_notification_audio_sample_fingerprint_extracted_at = NOW()""",
                (sample_id, len(fingerprints)),
            )
    conn.commit()


def insert_preview_fingerprints(conn, preview_id, fingerprints):
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM store__track_preview_fingerprint WHERE store__track_preview_id = %s",
            (preview_id,),
        )
        if fingerprints:
            psycopg2.extras.execute_batch(
                cur,
                """INSERT INTO store__track_preview_fingerprint
                       (store__track_preview_id,
                        store__track_preview_fingerprint_hash,
                        store__track_preview_fingerprint_position,
                        store__track_preview_fingerprint_frequency_bin)
                   VALUES (%s, %s, %s, %s)""",
                [(preview_id, fp['hash'], fp['position'], fp.get('f1')) for fp in fingerprints],
                page_size=500,
            )
            cur.execute(
                """INSERT INTO store__track_preview_fingerprint_meta
                       (store__track_preview_id,
                        store__track_preview_fingerprint_count,
                        store__track_preview_fingerprint_extracted_at)
                   VALUES (%s, %s, NOW())
                   ON CONFLICT (store__track_preview_id) DO UPDATE
                     SET store__track_preview_fingerprint_count = EXCLUDED.store__track_preview_fingerprint_count,
                         store__track_preview_fingerprint_extracted_at = NOW()""",
                (preview_id, len(fingerprints)),
            )
    conn.commit()


def fingerprint_one(downloads_dir, kind, file_id, url, filename=None):
    """Returns (fingerprints, error_or_None)."""
    try:
        downloaded_path, _ = download_and_manage_file(url, file_id, kind, filename, downloads_dir)
        audio_path = to_wav_if_needed(downloaded_path, kind, file_id, downloads_dir)
        if not os.path.exists(audio_path) or os.path.getsize(audio_path) == 0:
            return None, f"Audio file missing/empty: {audio_path}"
        fingerprints = extract_panako_fingerprints(audio_path)
        return fingerprints, None
    except Exception as e:  # noqa: BLE001
        return None, f"{type(e).__name__}: {e}\n{traceback.format_exc()}"


def run_findExactMatchForSample(conn, sample_id, threshold=STAGE1_THRESHOLD, bucket_seconds=BUCKET_SECONDS, peak_bucket_min=PEAK_BUCKET_MIN):
    """Verbatim port of the SQL in
    packages/back/routes/admin/db.js:findExactMatchForSample."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            WITH sample_hashes AS (
              SELECT DISTINCT user_notification_audio_sample_fingerprint_hash AS hash
              FROM user_notification_audio_sample_fingerprint
              WHERE user_notification_audio_sample_id = %(sample_id)s
            ),
            sample_hash_count AS (
              SELECT COUNT(*)::INTEGER AS count FROM sample_hashes
            ),
            candidates AS (
              SELECT
                stpf.store__track_preview_id,
                COUNT(DISTINCT stpf.store__track_preview_fingerprint_hash)::INTEGER AS matching_hashes
              FROM store__track_preview_fingerprint stpf
                INNER JOIN sample_hashes sh
                  ON stpf.store__track_preview_fingerprint_hash = sh.hash
              GROUP BY stpf.store__track_preview_id
              HAVING COUNT(DISTINCT stpf.store__track_preview_fingerprint_hash)::FLOAT /
                     NULLIF((SELECT count FROM sample_hash_count), 0) >= %(threshold)s
              ORDER BY matching_hashes DESC
              LIMIT 100
            ),
            matched_positions AS (
              SELECT
                c.store__track_preview_id,
                ROUND(
                  (pf.store__track_preview_fingerprint_position
                    - sf.user_notification_audio_sample_fingerprint_position)
                  / %(bucket)s::FLOAT
                ) * %(bucket)s::FLOAT AS delta_t_bucket
              FROM candidates c
                INNER JOIN store__track_preview_fingerprint pf
                  ON pf.store__track_preview_id = c.store__track_preview_id
                INNER JOIN user_notification_audio_sample_fingerprint sf
                  ON sf.user_notification_audio_sample_id = %(sample_id)s
                 AND sf.user_notification_audio_sample_fingerprint_hash
                     = pf.store__track_preview_fingerprint_hash
            ),
            bucket_counts AS (
              SELECT
                store__track_preview_id,
                delta_t_bucket,
                COUNT(*)::INTEGER AS bucket_count
              FROM matched_positions
              GROUP BY store__track_preview_id, delta_t_bucket
            ),
            peak_per_preview AS (
              SELECT DISTINCT ON (store__track_preview_id)
                store__track_preview_id,
                delta_t_bucket AS peak_delta_t_bucket,
                bucket_count AS peak_bucket_count
              FROM bucket_counts
              ORDER BY store__track_preview_id, bucket_count DESC, delta_t_bucket ASC
            )
            SELECT
              ppp.store__track_preview_id,
              stp.store__track_id,
              st.track_id,
              c.matching_hashes,
              (SELECT count FROM sample_hash_count) AS sample_hash_count,
              ppp.peak_delta_t_bucket::FLOAT AS peak_delta_t_seconds,
              ppp.peak_bucket_count AS match_score,
              (c.matching_hashes::FLOAT /
                NULLIF((SELECT count FROM sample_hash_count), 0)) AS stage1_ratio
            FROM peak_per_preview ppp
              INNER JOIN candidates c ON c.store__track_preview_id = ppp.store__track_preview_id
              INNER JOIN store__track_preview stp ON stp.store__track_preview_id = ppp.store__track_preview_id
              INNER JOIN store__track st ON st.store__track_id = stp.store__track_id
            WHERE ppp.peak_bucket_count >= %(peak_min)s
            ORDER BY match_score DESC, c.matching_hashes DESC
            LIMIT 50
            """,
            {
                'sample_id': sample_id,
                'threshold': threshold,
                'bucket': bucket_seconds,
                'peak_min': peak_bucket_min,
            },
        )
        return list(cur.fetchall())


def upsert_match(conn, sample_id, preview_id, score, threshold, bucket_seconds):
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO user_notification_audio_sample_match
                   (user_notification_audio_sample_id,
                    store__track_preview_id,
                    user_notification_audio_sample_match_score,
                    user_notification_audio_sample_match_threshold,
                    user_notification_audio_sample_match_bucket_seconds,
                    user_notification_audio_sample_match_matched_at)
               VALUES (%s, %s, %s, %s, %s, NOW())
               ON CONFLICT (user_notification_audio_sample_id, store__track_preview_id) DO UPDATE
                 SET user_notification_audio_sample_match_score = EXCLUDED.user_notification_audio_sample_match_score,
                     user_notification_audio_sample_match_threshold = EXCLUDED.user_notification_audio_sample_match_threshold,
                     user_notification_audio_sample_match_bucket_seconds = EXCLUDED.user_notification_audio_sample_match_bucket_seconds,
                     user_notification_audio_sample_match_matched_at = NOW()""",
            (sample_id, preview_id, score, threshold, bucket_seconds),
        )
    conn.commit()


# ---------------------------- main phases ---------------------------------


def phase_fingerprint(conn, downloads_dir):
    print('=== Phase 1: fingerprint samples ===')
    samples = fetch_samples_to_fingerprint(conn)
    sample_results = []
    for s in samples:
        print(f"\n--- sample {s['id']} ({s['filename']}) ---")
        fps, err = fingerprint_one(downloads_dir, 'sample', s['id'], s['url'], s['filename'])
        if err:
            print(f"FAILED: {err}")
            sample_results.append({'id': s['id'], 'fp_count': 0, 'error': err})
            continue
        insert_sample_fingerprints(conn, s['id'], fps)
        print(f"inserted {len(fps)} fingerprints for sample {s['id']}")
        sample_results.append({'id': s['id'], 'fp_count': len(fps), 'error': None})

    print('\n=== Phase 2: fingerprint previews ===')
    previews = fetch_previews_to_fingerprint(conn)
    print(f"{len(previews)} previews to fingerprint")
    preview_results = []
    start = time.time()
    for i, p in enumerate(previews, 1):
        elapsed = time.time() - start
        eta = elapsed / max(1, i - 1) * (len(previews) - i + 1) if i > 1 else 0
        print(f"\n--- preview {p['id']} ({i}/{len(previews)}, elapsed {elapsed:.0f}s, ETA {eta:.0f}s) ---")
        fps, err = fingerprint_one(downloads_dir, 'preview', p['id'], p['url'])
        if err:
            print(f"FAILED: {err}")
            preview_results.append({'id': p['id'], 'fp_count': 0, 'error': err[:200]})
            continue
        insert_preview_fingerprints(conn, p['id'], fps)
        print(f"inserted {len(fps)} fingerprints for preview {p['id']}")
        preview_results.append({'id': p['id'], 'fp_count': len(fps), 'error': None})
    return sample_results, preview_results


def phase_score(conn):
    print('\n=== Phase 3: score samples ===')
    # Wipe the match table before scoring so the table reflects ONLY what
    # Panako rediscovers. Any hand-curated rows are preserved as an
    # in-memory ground-truth set in phase_report; the table itself becomes
    # Panako's output. A row Panako can't rediscover disappears from the
    # Settings UI — the report flags it as a false negative.
    with conn.cursor() as cur:
        cur.execute('TRUNCATE user_notification_audio_sample_match')
    conn.commit()
    print('Wiped user_notification_audio_sample_match before scoring')

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT s.user_notification_audio_sample_id AS id,
                   s.user_notification_audio_sample_filename AS filename
            FROM user_notification_audio_sample s
            WHERE EXISTS (
              SELECT 1 FROM user_notification_audio_sample_fingerprint f
              WHERE f.user_notification_audio_sample_id = s.user_notification_audio_sample_id
            )
            ORDER BY s.user_notification_audio_sample_id
        """)
        samples = list(cur.fetchall())

    score_results = {}
    for s in samples:
        print(f"\n--- scoring sample {s['id']} ({s['filename']}) ---")
        matches = run_findExactMatchForSample(conn, s['id'])
        print(f"{len(matches)} candidates above threshold {STAGE1_THRESHOLD}")
        for m in matches[:5]:
            print(f"  preview {m['store__track_preview_id']} track {m['track_id']}: "
                  f"score={m['match_score']} hashes={m['matching_hashes']} "
                  f"stage1_ratio={m['stage1_ratio']:.4f} peak_delta_t={m['peak_delta_t_seconds']:.3f}s")
        for m in matches:
            upsert_match(
                conn, s['id'], m['store__track_preview_id'],
                int(m['match_score']), STAGE1_THRESHOLD, BUCKET_SECONDS,
            )
        score_results[s['id']] = matches
    return score_results, samples


def phase_report(conn, score_results, samples, sample_results=None, preview_results=None):
    print('\n=== Phase 4: build report ===')

    # Ground truth = the rows whose threshold marker is NULL or pre-set (synthetic),
    # but simpler: pull every row currently in the table and mark which were hand-
    # inserted by the values matching {1,2,6→74}, {3,4,5→163}.
    GROUND_TRUTH = {
        (1, 74), (2, 74), (6, 74),
        (3, 163), (4, 163), (5, 163),
    }

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT s.user_notification_audio_sample_id AS sample_id,
                   s.user_notification_audio_sample_filename AS filename
            FROM user_notification_audio_sample s ORDER BY s.user_notification_audio_sample_id
        """)
        sample_meta = {r['sample_id']: r['filename'] for r in cur.fetchall()}

        cur.execute("""
            SELECT user_notification_audio_sample_id AS sample_id,
                   store__track_preview_id AS preview_id,
                   user_notification_audio_sample_match_score AS score
            FROM user_notification_audio_sample_match
            ORDER BY user_notification_audio_sample_id, user_notification_audio_sample_match_score DESC
        """)
        all_matches = list(cur.fetchall())

    found = {(m['sample_id'], m['preview_id']) for m in all_matches}
    tp = GROUND_TRUTH & found
    fn = GROUND_TRUTH - found
    fp = found - GROUND_TRUTH
    precision = len(tp) / max(1, len(found))
    recall = len(tp) / max(1, len(GROUND_TRUTH))

    lines = []
    lines.append('# Panako fingerprinting — results report')
    lines.append('')
    lines.append(f'_Generated {dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")} on the local dev DB._')
    lines.append('')
    lines.append('## Run parameters')
    lines.append('')
    lines.append(f'- `SAMPLE_MATCH_DEFAULT_THRESHOLD`: `{STAGE1_THRESHOLD}` (Stage 1 distinct-hash overlap floor)')
    lines.append(f'- `SAMPLE_MATCH_BUCKET_SECONDS`: `{BUCKET_SECONDS}` (Stage 2 Δt bucket width)')
    lines.append(f'- `SAMPLE_MATCH_PEAK_BUCKET_MIN`: `{PEAK_BUCKET_MIN}` (Stage 2 peak bucket floor)')
    lines.append('')

    if sample_results is not None:
        sample_ok = [r for r in sample_results if r['error'] is None]
        sample_fail = [r for r in sample_results if r['error'] is not None]
        preview_ok = [r for r in preview_results if r['error'] is None]
        preview_fail = [r for r in preview_results if r['error'] is not None]
        lines.append('## Extraction summary')
        lines.append('')
        lines.append(f'- Samples fingerprinted: **{len(sample_ok)}** / {len(sample_results)} '
                     f'(total hashes: {sum(r["fp_count"] for r in sample_ok)})')
        lines.append(f'- Previews fingerprinted: **{len(preview_ok)}** / {len(preview_results)} '
                     f'(total hashes: {sum(r["fp_count"] for r in preview_ok)})')
        if sample_fail:
            lines.append(f'- Sample failures: {len(sample_fail)}')
        if preview_fail:
            lines.append(f'- Preview failures: {len(preview_fail)}')
            lines.append('')
            lines.append('  Failure samples (first 10):')
            for f in preview_fail[:10]:
                lines.append(f'  - preview {f["id"]}: {f["error"]}')
        lines.append('')

    lines.append('## Ground truth vs Panako')
    lines.append('')
    lines.append('Ground truth = the 6 `(sample, preview)` rows that were hand-inserted '
                 'into `user_notification_audio_sample_match` to seed the Settings UI '
                 '(mantra samples 1,2,6 → preview 74 / track 48; serious samples '
                 '3,4,5 → preview 163 / track 111).')
    lines.append('')
    lines.append(f'- **Recall** (of the 6 ground-truth pairs): {len(tp)}/{len(GROUND_TRUTH)} = **{recall:.0%}**')
    lines.append(f'- **Precision** (vs total Panako-discovered matches above threshold): '
                 f'{len(tp)}/{len(found)} = **{precision:.0%}**')
    lines.append(f'- True positives: **{len(tp)}**')
    lines.append(f'- False negatives (ground truth missed by Panako): **{len(fn)}**')
    lines.append(f'- False positives / additional matches found: **{len(fp)}**')
    lines.append('')

    if fn:
        lines.append('### Ground-truth pairs Panako did NOT find')
        lines.append('')
        lines.append('| Sample | Filename | Preview | Why |')
        lines.append('| --- | --- | --- | --- |')
        for s_id, p_id in sorted(fn):
            # Try to surface why — was the sample fingerprinted? Was the preview?
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM user_notification_audio_sample_fingerprint WHERE user_notification_audio_sample_id = %s", (s_id,))
                sample_fp = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM store__track_preview_fingerprint WHERE store__track_preview_id = %s", (p_id,))
                preview_fp = cur.fetchone()[0]
            reason = []
            if sample_fp == 0:
                reason.append(f'sample has 0 fingerprints')
            if preview_fp == 0:
                reason.append(f'preview has 0 fingerprints')
            if not reason:
                reason.append(f'Stage-1 ratio below {STAGE1_THRESHOLD}')
            lines.append(f'| {s_id} | {sample_meta.get(s_id, "?")} | {p_id} | {"; ".join(reason)} |')
        lines.append('')

    lines.append('## Per-sample top-K matches')
    lines.append('')
    for s in samples:
        s_id = s['id']
        matches = score_results.get(s_id, [])
        lines.append(f'### Sample {s_id} — `{s["filename"]}`')
        lines.append('')
        gt_previews_for_sample = {p for (sid, p) in GROUND_TRUTH if sid == s_id}
        if matches:
            lines.append('| Rank | Preview | Track | match_score | matching_hashes | stage1_ratio | peak Δt (s) | ground truth? |')
            lines.append('| --- | --- | --- | --- | --- | --- | --- | --- |')
            for i, m in enumerate(matches[:10], 1):
                is_gt = '✅' if m['store__track_preview_id'] in gt_previews_for_sample else ''
                lines.append(
                    f'| {i} | {m["store__track_preview_id"]} | {m["track_id"]} | '
                    f'{m["match_score"]} | {m["matching_hashes"]} | '
                    f'{m["stage1_ratio"]:.4f} | {m["peak_delta_t_seconds"]:.3f} | {is_gt} |'
                )
        else:
            lines.append('_No matches above threshold._')
        if gt_previews_for_sample:
            ranks = []
            for gt_p in gt_previews_for_sample:
                rank = next((i + 1 for i, m in enumerate(matches) if m['store__track_preview_id'] == gt_p), None)
                ranks.append(f'preview {gt_p}: {"rank " + str(rank) if rank else "NOT FOUND"}')
            lines.append('')
            lines.append(f'Ground truth: {"; ".join(ranks)}')
        lines.append('')

    if fp:
        lines.append('## Additional Panako matches (not in ground truth)')
        lines.append('')
        lines.append('Panako surfaced these pairs above threshold even though they were '
                     'not hand-curated as positives. They could be true positives the '
                     'curator missed, false positives from a noisy threshold, or '
                     'self-matches.')
        lines.append('')
        lines.append('| Sample | Filename | Preview | Track | score |')
        lines.append('| --- | --- | --- | --- | --- |')
        # Pull track + score for context
        for sample_id, preview_id in sorted(list(fp))[:50]:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT m.user_notification_audio_sample_match_score AS score,
                           st.track_id
                    FROM user_notification_audio_sample_match m
                      JOIN store__track_preview stp ON stp.store__track_preview_id = m.store__track_preview_id
                      JOIN store__track st ON st.store__track_id = stp.store__track_id
                    WHERE m.user_notification_audio_sample_id = %s
                      AND m.store__track_preview_id = %s
                """, (sample_id, preview_id))
                row = cur.fetchone()
            score = row[0] if row else '?'
            track_id = row[1] if row else '?'
            lines.append(f'| {sample_id} | {sample_meta.get(sample_id, "?")} | '
                         f'{preview_id} | {track_id} | {score} |')
        if len(fp) > 50:
            lines.append(f'| _...{len(fp) - 50} more_ | | | | |')
        lines.append('')

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text('\n'.join(lines))
    print(f'Report written to {REPORT_PATH}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--skip-fingerprint', action='store_true')
    ap.add_argument('--report-only', action='store_true')
    args = ap.parse_args()

    conn = db_connect()
    downloads_dir = ensure_downloads_directory()

    sample_results = preview_results = None
    if not args.skip_fingerprint and not args.report_only:
        sample_results, preview_results = phase_fingerprint(conn, downloads_dir)
        # Persist a small ledger so a later --report-only run can still cite stats
        ledger = {'samples': sample_results, 'previews': preview_results}
        Path(__file__).parent.joinpath('last_fingerprint_run.json').write_text(json.dumps(ledger, indent=2))
    else:
        ledger_path = Path(__file__).parent / 'last_fingerprint_run.json'
        if ledger_path.exists():
            ledger = json.loads(ledger_path.read_text())
            sample_results = ledger['samples']
            preview_results = ledger['previews']

    if not args.report_only:
        score_results, samples = phase_score(conn)
        Path(__file__).parent.joinpath('last_score_run.json').write_text(json.dumps(
            {sid: matches for sid, matches in score_results.items()}, indent=2, default=str
        ))
    else:
        # Re-derive samples + score_results from the freshly-populated match table
        score_results, samples = phase_score(conn)

    phase_report(conn, score_results, samples, sample_results, preview_results)


if __name__ == '__main__':
    main()
