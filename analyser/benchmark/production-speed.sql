-- Read-only queries for `fomoplayer query "<statement>"`, one statement per
-- call. The query endpoint stops a statement after 3 seconds, so each query
-- covers a bounded time window and joins only what it needs. Change the dates
-- to the run you want to look at (query 1 finds the busy weeks).

-- 1. When the analyser ran: tracks saved per week.
SELECT date_trunc('week', store__track_preview_embedding_updated_at)::date AS week, COUNT(*) AS embeddings
FROM store__track_preview_embedding
GROUP BY 1 ORDER BY 1 DESC LIMIT 12;

SELECT date_trunc('week', store__track_preview_fingerprint_extracted_at)::date AS week, COUNT(*) AS fingerprints
FROM store__track_preview_fingerprint_meta
GROUP BY 1 ORDER BY 1 DESC LIMIT 12;

-- 2. Throughput per day within one week. A gap is the time since the previous
--    saved row; gaps over 10 minutes are pauses between runs and left out of
--    the busy hours. The fingerprint worker runs 4 processes in parallel, so
--    its gaps are throughput, not time per track. Swap in
--    store__track_preview_fingerprint_meta / ..._fingerprint_extracted_at for
--    fingerprints.
SELECT t::date AS day
     , COUNT(*) AS tracks
     , ROUND(SUM(gap_s) FILTER (WHERE gap_s <= 600)::numeric / 3600, 1) AS busy_hours
     , ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_s)::numeric, 2) AS median_gap_s
     , ROUND((COUNT(*) FILTER (WHERE gap_s <= 600)
              / NULLIF(SUM(gap_s) FILTER (WHERE gap_s <= 600), 0) * 3600)::numeric) AS tracks_per_busy_hour
FROM (
  SELECT store__track_preview_embedding_updated_at AS t
       , EXTRACT(EPOCH FROM store__track_preview_embedding_updated_at
                 - LAG(store__track_preview_embedding_updated_at) OVER (ORDER BY store__track_preview_embedding_updated_at)) AS gap_s
  FROM store__track_preview_embedding
  WHERE store__track_preview_embedding_updated_at >= DATE '2026-09-28'
    AND store__track_preview_embedding_updated_at < DATE '2026-09-28' + 7
) x
GROUP BY 1 ORDER BY 1;

-- 3. Store mix and preview length for one day of a run (store_id 1 = Beatport,
--    2 = Bandcamp; see `SELECT * FROM store`).
SELECT st.store_id
     , COUNT(*) AS tracks
     , ROUND(AVG(p.store__track_preview_end_ms - p.store__track_preview_start_ms) / 1000.0) AS avg_audio_s
FROM store__track_preview_embedding x
     JOIN store__track_preview p ON p.store__track_preview_id = x.store__track_preview_id
     JOIN store__track st ON st.store__track_id = p.store__track_id
WHERE x.store__track_preview_embedding_updated_at >= DATE '2026-10-04'
  AND x.store__track_preview_embedding_updated_at < DATE '2026-10-04' + 1
GROUP BY 1;

-- 4. Inflow: new previews and minutes of audio over the last 60 days, per store.
SELECT st.store_id
     , COUNT(*) AS previews_60d
     , ROUND(AVG(p.store__track_preview_end_ms - p.store__track_preview_start_ms) / 1000.0) AS avg_audio_s
     , ROUND(SUM(p.store__track_preview_end_ms - p.store__track_preview_start_ms) / 60000.0) AS audio_minutes_60d
FROM track t
     JOIN store__track st ON st.track_id = t.track_id
     JOIN store__track_preview p ON p.store__track_id = st.store__track_id
WHERE t.track_added > NOW() - INTERVAL '60 days'
GROUP BY 1;

-- 5. Busiest days for new previews, to size for peaks rather than the average.
SELECT track_added::date AS day, COUNT(*) AS previews
FROM store__track_preview
     JOIN store__track USING (store__track_id)
     JOIN track USING (track_id)
WHERE track_added > NOW() - INTERVAL '60 days'
GROUP BY 1
ORDER BY previews DESC
LIMIT 5;

-- 6. Current backlog: previews the workers would pick up that have no
--    embedding / fingerprint. Like the worker queues, previews without a URL
--    are skipped except on Bandcamp, whose stream URL is resolved at run time.
SELECT store_name
     , COUNT(*) FILTER (WHERE e.store__track_preview_id IS NULL) AS without_embedding
     , COUNT(*) FILTER (WHERE m.store__track_preview_id IS NULL) AS without_fingerprint
FROM store__track_preview p
     JOIN store__track USING (store__track_id)
     JOIN store USING (store_id)
     LEFT JOIN store__track_preview_embedding e
       ON e.store__track_preview_id = p.store__track_preview_id
      AND e.store__track_preview_embedding_type = 'discogs_multi_embeddings-effnet-bs64-1'
     LEFT JOIN store__track_preview_fingerprint_meta m
       ON m.store__track_preview_id = p.store__track_preview_id
WHERE NOT p.store__track_preview_missing
  AND (p.store__track_preview_url IS NOT NULL OR store_name = 'Bandcamp')
GROUP BY store_name;
