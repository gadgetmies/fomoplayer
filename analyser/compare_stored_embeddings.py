"""Compare the shared package's embeddings with the vectors already stored.

The gate of the shared-track-embedding change: the analyser may compute
embeddings with the `track_embedding` package only when, for at least 200
store previews (across formats and sample rates) and 20 notification audio
samples that already hold a stored `discogs_multi_embeddings-effnet-bs64-1`
vector, the package's vector has cosine similarity of at least 0.99999 with
the stored one.

The database is only read: the connection runs every transaction read-only
(`default_transaction_read_only=on`), so a write would fail. Audio comes from
the preview's URL (`store__track_preview_url`, or the Bandcamp stream URL
fetched last) and, for samples, from the back end's storage redirect
(`<api>/storage/<object key>`). Previews are embedded the way the preview
workers embed them (FFmpeg to a 16-bit WAV, then the WAV); samples the way
the sample worker does (the downloaded file itself).

Items whose audio cannot be downloaded any more are listed as unavailable and
replaced by other randomly picked ones, up to `--max-candidates` per kind.

  DATABASE_URL=postgres://… FOMOPLAYER_API_URL=https://…/api \\
    venv/bin/python compare_stored_embeddings.py --out /tmp/embedding-gate

Writes `<out>/items.csv` (one row per item) and `<out>/summary.json`, prints
the summary, and exits 0 when the gate passes, 1 when it fails.
"""

import argparse
import csv
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request

import numpy as np
import psycopg2

import embedding
from audio_decode import to_wav

GATE_COSINE = 0.99999
GATE_PREVIEWS = 200
GATE_SAMPLES = 20
DOWNLOAD_TIMEOUT_S = 60

# Items are picked by id first, so only the picked vectors are read and converted to text.
PREVIEW_QUERY = """
WITH picked AS (SELECT p.store__track_preview_id
                FROM store__track_preview_embedding e
                       JOIN store__track_preview p USING (store__track_preview_id)
                WHERE e.store__track_preview_embedding_type = %(type)s
                  AND COALESCE(p.store__track_preview_url, p.store__track_preview_url_ephemeral) IS NOT NULL
                ORDER BY random()
                LIMIT %(limit)s)
SELECT p.store__track_preview_id                                                   AS id
     , s.store_name                                                                AS store
     , COALESCE(p.store__track_preview_url, p.store__track_preview_url_ephemeral)  AS url
     , e.store__track_preview_embedding::TEXT                                      AS stored
FROM picked
       JOIN store__track_preview p USING (store__track_preview_id)
       JOIN store__track_preview_embedding e USING (store__track_preview_id)
       JOIN store__track st USING (store__track_id)
       JOIN store s USING (store_id)
WHERE e.store__track_preview_embedding_type = %(type)s
ORDER BY p.store__track_preview_id
"""

SAMPLE_QUERY = """
WITH picked AS (SELECT user_notification_audio_sample_id
                FROM user_notification_audio_sample_embedding
                WHERE user_notification_audio_sample_embedding_type = %(type)s
                ORDER BY random()
                LIMIT %(limit)s)
SELECT s.user_notification_audio_sample_id               AS id
     , s.user_notification_audio_sample_file_type        AS store
     , s.user_notification_audio_sample_object_key       AS url
     , e.user_notification_audio_sample_embedding::TEXT  AS stored
FROM picked
       JOIN user_notification_audio_sample s USING (user_notification_audio_sample_id)
       JOIN user_notification_audio_sample_embedding e USING (user_notification_audio_sample_id)
WHERE e.user_notification_audio_sample_embedding_type = %(type)s
ORDER BY s.user_notification_audio_sample_id
"""


def parse_args(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--database-url', default=os.environ.get('DATABASE_URL'),
                    help='Database holding the stored vectors (default: DATABASE_URL); only read')
    ap.add_argument('--api-url', default=os.environ.get('FOMOPLAYER_API_URL'),
                    help='Back end API URL for sample audio (default: FOMOPLAYER_API_URL)')
    ap.add_argument('--sample-audio-url', default='{api}/storage/{key}',
                    help='Where a sample\'s audio is read, with {api} and {key} (the object key) filled in')
    ap.add_argument('--previews', type=int, default=GATE_PREVIEWS, help='Previews to compare')
    ap.add_argument('--samples', type=int, default=GATE_SAMPLES, help='Notification samples to compare')
    ap.add_argument('--max-candidates', type=int, default=None,
                    help='Items picked per kind before giving up on unavailable audio (default: 3 x the count)')
    ap.add_argument('--seed', type=float, default=0.42, help='Random pick seed (-1..1, Postgres setseed)')
    ap.add_argument('--out', required=True, help='Folder for items.csv and summary.json')
    args = ap.parse_args(argv)
    if not args.database_url:
        ap.error('--database-url or DATABASE_URL is required')
    if args.samples and not args.api_url and '{api}' in args.sample_audio_url:
        ap.error('--api-url or FOMOPLAYER_API_URL is required for sample audio')
    return args


def connect_read_only(database_url):
    return psycopg2.connect(database_url, options='-c default_transaction_read_only=on -c statement_timeout=300000')


def pick(conn, query, limit, seed):
    with conn.cursor() as cur:
        cur.execute('SELECT setseed(%s)', (seed,))
        cur.execute(query, {'type': embedding.DEFAULT_MODEL, 'limit': limit})
        columns = [c.name for c in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def download(url, path):
    request = urllib.request.Request(url, headers={'User-Agent': 'fomoplayer-embedding-gate'})
    with urllib.request.urlopen(request, timeout=DOWNLOAD_TIMEOUT_S) as response, open(path, 'wb') as out:
        shutil.copyfileobj(response, out)
    if os.path.getsize(path) == 0:
        raise OSError(f'{url} returned no data')


def probe(path):
    """`codec sample_rate channels` of the first audio stream, for the report."""
    result = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries',
                             'stream=codec_name,sample_rate,channels', '-of', 'json', path],
                            capture_output=True, text=True)
    if result.returncode != 0:
        return {'codec': None, 'sample_rate': None, 'channels': None}
    streams = json.loads(result.stdout).get('streams') or [{}]
    stream = streams[0]
    return {'codec': stream.get('codec_name'), 'sample_rate': stream.get('sample_rate'),
            'channels': stream.get('channels')}


def cosine(a, b):
    a, b = np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64)
    return float(a @ b / np.linalg.norm(a) / np.linalg.norm(b))


def compare(kind, item, url, model, work_dir):
    """One result row: the cosine between the package's vector and the stored
    one, or the reason there is none."""
    row = {'kind': kind, 'id': item['id'], 'source': item['store'], 'status': None, 'cosine': None,
           'codec': None, 'sample_rate': None, 'channels': None, 'error': None}
    path = os.path.join(work_dir, f'{kind}_{item["id"]}')
    try:
        try:
            download(url, path)
        except Exception as e:  # noqa: BLE001 - every download failure makes the item unavailable
            row.update(status='unavailable', error=f'{type(e).__name__}: {e}'[:300])
            return row
        row.update(probe(path))
        if kind == 'preview':
            wav = to_wav(path, path + '.wav')
            try:
                vector = embedding.embed_file(wav, model)
            finally:
                os.remove(wav)
        else:
            vector = embedding.embed_file(path, model)
        if vector is None:
            row.update(status='too short')
            return row
        row.update(status='compared', cosine=cosine(vector, json.loads(item['stored'])))
        return row
    except Exception as e:  # noqa: BLE001 - reported per item; the gate fails on it
        row.update(status='error', error=f'{type(e).__name__}: {e}'[:300])
        return row
    finally:
        if os.path.exists(path):
            os.remove(path)


def run_kind(kind, items, wanted, url_of, model, work_dir, rows):
    compared = 0
    for item in items:
        if compared >= wanted:
            break
        row = compare(kind, item, url_of(item), model, work_dir)
        rows.append(row)
        if row['status'] == 'compared':
            compared += 1
        cos = f"{row['cosine']:.9f}" if row['cosine'] is not None else '-'
        print(f"{kind} {row['id']} {row['source']} {row['codec']} {row['sample_rate']} "
              f"{row['status']} {cos} {row['error'] or ''}".rstrip(), flush=True)


def summarise(rows, wanted_previews, wanted_samples):
    def stats(kind):
        values = sorted(r['cosine'] for r in rows if r['kind'] == kind and r['status'] == 'compared')
        statuses = {}
        for r in rows:
            if r['kind'] == kind:
                statuses[r['status']] = statuses.get(r['status'], 0) + 1
        formats = sorted({f"{r['codec']} {r['sample_rate']} Hz {r['channels']} ch" for r in rows
                          if r['kind'] == kind and r['status'] == 'compared'})
        return {
            'compared': len(values),
            'statuses': statuses,
            'min_cosine': values[0] if values else None,
            'median_cosine': values[len(values) // 2] if values else None,
            'below_gate': sum(v < GATE_COSINE for v in values),
            'errors': statuses.get('error', 0),
            'formats': formats,
        }

    previews, samples = stats('preview'), stats('sample')
    passed = (previews['compared'] >= wanted_previews and samples['compared'] >= wanted_samples
              and previews['below_gate'] == 0 and samples['below_gate'] == 0
              and previews['errors'] == 0 and samples['errors'] == 0)
    return {'version': embedding.EMBEDDING_VERSIONS[embedding.DEFAULT_MODEL], 'type': embedding.DEFAULT_MODEL,
            'gate_cosine': GATE_COSINE, 'wanted': {'previews': wanted_previews, 'samples': wanted_samples},
            'previews': previews, 'samples': samples, 'passed': passed}


def main(argv=None):
    args = parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    model = embedding.build_model()
    rows = []
    conn = connect_read_only(args.database_url)
    try:
        previews = pick(conn, PREVIEW_QUERY, args.max_candidates or 3 * args.previews, args.seed)
        samples = pick(conn, SAMPLE_QUERY, args.max_candidates or 3 * args.samples, args.seed)
    finally:
        conn.close()
    api = (args.api_url or '').rstrip('/')
    with tempfile.TemporaryDirectory(prefix='embedding_gate_') as work_dir:
        run_kind('preview', previews, args.previews, lambda item: item['url'], model, work_dir, rows)
        run_kind('sample', samples, args.samples,
                 lambda item: args.sample_audio_url.format(api=api, key=item['url']), model, work_dir, rows)

    with open(os.path.join(args.out, 'items.csv'), 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ['kind'])
        writer.writeheader()
        writer.writerows(rows)
    summary = summarise(rows, args.previews, args.samples)
    with open(os.path.join(args.out, 'summary.json'), 'w') as f:
        json.dump(summary, f, indent=2)
    print(json.dumps(summary, indent=2))
    return 0 if summary['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
