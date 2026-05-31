-- Find artists whose name appears to have been polluted by track-title or
-- version metadata at import time (e.g. "feat. Bar", "Foo (Bar Remix)",
-- "(Foo)", trailing punctuation). Classifies each match into one or more
-- kinds and offers a best-effort cleaned suggestion.
--
-- Detection is intentionally permissive (the existing split detector treats
-- "feat." as a multi-artist signal; here it is a pollution signal) so each
-- row is a candidate an admin reviews and either renames (strip the junk),
-- merges into the real artist, or deletes if the record is bogus.
--
-- Ad-hoc exploration only; the detectArtistNameIssues job applies the same
-- patterns and writes results to artist_name_issue for the radiator UI.
WITH classified AS (
  SELECT
    a.artist_id   AS id,
    a.artist_name AS name,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN a.artist_name ~* '\m(featuring|feat|ft)\M'
           THEN 'feat' END,
      CASE WHEN a.artist_name ~* '\m(remix|rmx|edit|vip|bootleg|dub|rework|instrumental|mashup|flip)\M'
           THEN 'versionTag' END,
      CASE WHEN a.artist_name ~ '[(\[{]'
           THEN 'parenthetical' END,
      CASE WHEN a.artist_name ~ '^\s|\s$|\s{2}|^[,;&+/-]|[,;&+/-]$'
           THEN 'whitespace' END
    ], NULL) AS kinds,
    -- Strip a trailing bracket group, any "feat. X" tail, a trailing
    -- version-tag word, then trim edge whitespace and stray punctuation. A
    -- starting point only: the admin may instead want to merge into a
    -- different artist or delete the bogus record entirely.
    TRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              a.artist_name,
              '\s*[(\[{][^()\[\]{}]*[)\]}]\s*$', '', 'g'
            ),
            '\s*\m(featuring|feat|ft)\M\.?\s+.+$', '', 'i'
          ),
          '\s+\m(remix|rmx|edit|vip|bootleg|dub|rework|instrumental|mashup|flip)\M\.?\s*$', '', 'i'
        ),
        '^[\s,;&+/-]+|[\s,;&+/-]+$', '', 'g'
      )
    ) AS suggested_name,
    (SELECT COUNT(DISTINCT track_id) FROM track__artist ta WHERE ta.artist_id = a.artist_id) AS track_count
  FROM artist a
)
SELECT id, name, kinds, suggested_name, track_count
FROM classified
WHERE CARDINALITY(kinds) > 0
ORDER BY track_count DESC, name ASC;
