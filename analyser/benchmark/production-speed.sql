-- 1. Embedding throughput, per store. Gap = seconds since the previous saved
--    embedding (any store), counted only inside a run (gap <= 10 min).
WITH e AS (
  SELECT store_name
       , store__track_preview_embedding_updated_at AS t
       , COALESCE(store__track_preview_end_ms - store__track_preview_start_ms, store__track_preview_track_duration_ms) / 1000.0 AS audio_s
  FROM store__track_preview_embedding
       JOIN store__track_preview USING (store__track_preview_id)
       JOIN store__track USING (store__track_id)
       JOIN store USING (store_id)
  WHERE store__track_preview_embedding_type = 'discogs_multi_embeddings-effnet-bs64-1'
), g AS (
  SELECT *, EXTRACT(EPOCH FROM t - LAG(t) OVER (ORDER BY t)) AS gap_s FROM e
)
SELECT store_name
     , COUNT(*) AS tracks
     , MIN(t)::date AS first_day
     , MAX(t)::date AS last_day
     , ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_s)::numeric, 2) AS median_gap_s
     , ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY audio_s)::numeric, 0) AS median_audio_s
     , ROUND((SUM(gap_s) / NULLIF(SUM(audio_s), 0) * 60)::numeric, 2) AS s_per_audio_minute
FROM g
WHERE gap_s > 0 AND gap_s <= 600
GROUP BY store_name
ORDER BY tracks DESC;

-- 2. Fingerprint throughput, per store. The fingerprint worker runs 4
--    processes in parallel by default, so a gap is throughput, not per-track time.
WITH f AS (
  SELECT store_name
       , store__track_preview_fingerprint_extracted_at AS t
       , COALESCE(store__track_preview_end_ms - store__track_preview_start_ms, store__track_preview_track_duration_ms) / 1000.0 AS audio_s
  FROM store__track_preview_fingerprint_meta
       JOIN store__track_preview USING (store__track_preview_id)
       JOIN store__track USING (store__track_id)
       JOIN store USING (store_id)
), g AS (
  SELECT *, EXTRACT(EPOCH FROM t - LAG(t) OVER (ORDER BY t)) AS gap_s FROM f
)
SELECT store_name
     , COUNT(*) AS tracks
     , MIN(t)::date AS first_day
     , MAX(t)::date AS last_day
     , ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_s)::numeric, 2) AS median_gap_s
     , ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY audio_s)::numeric, 0) AS median_audio_s
     , ROUND((SUM(gap_s) / NULLIF(SUM(audio_s), 0) * 60)::numeric, 2) AS s_per_audio_minute
FROM g
WHERE gap_s > 0 AND gap_s <= 600
GROUP BY store_name
ORDER BY tracks DESC;

-- 3. Daily inflow of new previews over the last 60 days, per store.
SELECT store_name
     , COUNT(*) AS previews_60d
     , ROUND(COUNT(*) / 60.0) AS per_day_avg
     , ROUND(SUM(COALESCE(store__track_preview_end_ms - store__track_preview_start_ms, store__track_preview_track_duration_ms) / 60000.0)) AS audio_minutes_60d
FROM store__track_preview
     JOIN store__track USING (store__track_id)
     JOIN track USING (track_id)
     JOIN store USING (store_id)
WHERE track_added > NOW() - INTERVAL '60 days'
GROUP BY store_name
ORDER BY previews_60d DESC;

-- 4. Busiest days, to size for peaks rather than the average.
SELECT track_added::date AS day, COUNT(*) AS previews
FROM store__track_preview
     JOIN store__track USING (store__track_id)
     JOIN track USING (track_id)
WHERE track_added > NOW() - INTERVAL '60 days'
GROUP BY 1
ORDER BY previews DESC
LIMIT 5;

-- 5. Current backlog: previews without an embedding / fingerprint.
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
GROUP BY store_name;
