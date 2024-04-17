const pg = require('fomoplayer_shared').db.pg
const R = require('ramda')
const sql = require('sql-template-strings')
const { apiURL } = require('../../../config')
const logger = require('fomoplayer_shared').logger(__filename)

module.exports.queryStoreId = storeName =>
  pg
    .queryRowsAsync(
      //language=PostgreSQL
      sql`-- queryStoreId
      SELECT store_id
      FROM
        store
      WHERE store_name = ${storeName}`
    )
    .then(([{ store_id }]) => store_id)

module.exports.queryStoreName = async storeId => {
  const [{ store_name }] = await pg.queryRowsAsync(
    //language=PostgreSQL
    sql`-- queryStoreName
    SELECT store_name
    FROM
      store
    WHERE store_id = ${storeId}
    `
  )
  return store_name
}

module.exports.queryStoreRegexes = async () =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryStoreRegexes
    SELECT store_id          AS id
         , LOWER(store_name) AS name
         , store_url         AS url
         , JSON_BUILD_OBJECT(
        'artist', store_artist_regex,
        'label', store_label_regex,
        'playlist', JSON_AGG(
            JSON_BUILD_OBJECT(
                'typeId', store_playlist_type_store_id,
                'regex', store_playlist_type_regex
            )
                    )
           )                 AS regex
    FROM
      store
      NATURAL JOIN store_playlist_type
    GROUP BY 1, 2, 3, store_artist_regex, store_label_regex`
  )

const getFieldFromResult = field => R.path([0, field])

async function queryStoreLabelIdForUrl(tx, url) {
  return await tx.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryStoreLableIdForUrl SELECT store__label_id AS "storeLabelId" FROM store__label
    SELECT store__label_id AS "storeLabelId"
    FROM
      store__label
      NATURAL JOIN store
    WHERE store__label_url = ${url}
    `
  )
}

module.exports.ensureLabelExists = async (tx, storeUrl, label, sourceId) => {
  const getLabelIdFromResult = getFieldFromResult('label_id')
  let labelId = await tx
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- ensureLabelExists SELECT label_id
      SELECT label_id
      FROM
        label
      WHERE LOWER(label_name) = LOWER(${label.name}) -- TODO: Use improved heuristic
      `
    )
    .then(getLabelIdFromResult)

  if (!labelId) {
    logger.debug(`Label ${label.name} not found, inserting`)
    labelId = await tx
      .queryRowsAsync(
        // language=PostgreSQL
        sql`-- ensureLabelExists INSERT INTO label
        INSERT
        INTO label
          (label_name, label_source)
        VALUES (${label.name}, ${sourceId})
        RETURNING label_id
        `
      )
      .then(getLabelIdFromResult)
  }

  const storeLabelIds = await queryStoreLabelIdForUrl(tx, label.url)

  if (storeLabelIds.length === 0) {
    await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`-- ensureLabelExists INSERT INTO store__label
      INSERT
      INTO store__label
      (store__label_store_id, store__label_url, store_id, label_id, store__label_source)
      SELECT ${label.id}
           , ${label.url}
           , store_id
           , ${labelId}
           , ${sourceId}
      FROM
        store
      WHERE store_url = ${storeUrl}
      ON CONFLICT ON CONSTRAINT store__label_store__label_store_id_store_id_key
        DO UPDATE SET store__label_url = excluded.store__label_url
      `
    )
  }

  const res = await queryStoreLabelIdForUrl(tx, label.url)
  const [{ storeLabelId }] = res

  return { labelId, storeLabelId }
}

module.exports.ensureReleaseExists = async (tx, storeUrl, release, artists, sourceId) => {
  const getReleaseIdFromResult = getFieldFromResult('release_id')

  let releaseId = await tx
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- ensureReleaseExists SELECT release_id
      SELECT release_id
      FROM
        store__release
        NATURAL JOIN release
        NATURAL JOIN store
      WHERE (store__release_store_id = ${release.id} AND store_url = ${storeUrl})
         OR store__release_url = ${release.url}
         OR release_catalog_number = ${release.catalog_number} -- TODO: is this safe?
      `
    )
    .then(getReleaseIdFromResult)

  if (!releaseId) {
    releaseId = await tx
      .queryRowsAsync(
        // language=PostgreSQL
        sql`-- ensureReleaseExists SELECT release_id by artist and title
SELECT
    release_id
FROM
    release
        NATURAL JOIN release__track
        NATURAL JOIN track__artist
WHERE
    release_name = ${release.title}
GROUP BY 1
HAVING
    ARRAY_AGG(artist_id) @> ${R.pluck('id', artists)}
        `
      )
      .then(getReleaseIdFromResult)
  }

  if (!releaseId) {
    releaseId = await tx
      .queryRowsAsync(
        // language=PostgreSQL
        sql`-- ensureReleaseExists INSERT INTO release
        INSERT
        INTO release
          (release_name, release_source, release_catalog_number)
        VALUES (${release.title}, ${sourceId}, ${release.catalog_number})
        RETURNING release_id
        `
      )
      .then(getReleaseIdFromResult)
  } else {
    await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`-- ensureReleaseExists UPDATE release
      UPDATE release
      SET release_catalog_number = COALESCE(release_catalog_number, ${release.catalog_number})
      WHERE release_id = ${releaseId}
      `
    )
  }

  await tx.queryRowsAsync(
    // language=PostgreSQL
    sql`-- ensureReleaseExists INSERT INTO store__release
    INSERT
    INTO store__release
    (store__release_store_id, store__release_url, store_id, release_id, store__release_source)
    SELECT ${release.id}
         , ${release.url}
         , store_id
         , ${releaseId}
         , ${sourceId}
    FROM
      store
    WHERE store_url = ${storeUrl}
    ON CONFLICT ON CONSTRAINT store__release_store_id_store__release_store_id_key
      DO UPDATE SET store__release_url = ${release.url}
                  , release_id         = ${releaseId}
    `
  )

  return releaseId
}

module.exports.ensureArtistExists = async (tx, storeUrl, artist, sourceId) => {
  const getArtistIdFromResult = getFieldFromResult('artist_id')

  let artistId = await tx
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- ensureArtistExists SELECT artist_id
      SELECT artist_id
      FROM
        store__artist
        NATURAL JOIN store
      WHERE store_url = ${storeUrl}
        AND (store__artist_store_id = ${artist.id} OR store__artist_url = ${artist.url}) -- TODO: add name matching for bandcamp support?
      `
    )
    .then(getArtistIdFromResult)

  if (!artistId) {
    logger.debug(`Artist ${artist.name} not found with id, trying with name`)
    const genreIds = artist.genres?.map(R.prop('id')) || []
    artistId = await tx
      .queryRowsAsync(
        // language=PostgreSQL
        sql`-- ensureArtistExists SELECT artist_id
WITH artist_candidates AS (SELECT artist_id
                           FROM
                             artist
                           WHERE LOWER(artist_name) = LOWER(${artist.name}))
   , genres AS (SELECT DISTINCT artist_id, store__genre_store_id, genre_parent
                FROM
                  artist_candidates
                  NATURAL LEFT JOIN artist__genre
                  NATURAL LEFT JOIN genre
                  NATURAL LEFT JOIN store__genre
                  NATURAL LEFT JOIN store
                WHERE store_url = ${storeUrl})
   -- TODO: this limits the genre hierarchy to two levels
   , parent_genres AS (SELECT DISTINCT artist_id, sg.store__genre_store_id
                       FROM
                         genres gs
                         JOIN genre g ON (g.genre_id = gs.genre_parent)
                         JOIN store__genre sg ON (sg.genre_id = g.genre_id)
                         NATURAL JOIN store
                       WHERE store_url = ${storeUrl})
   , all_genres AS (SELECT artist_id, store__genre_store_id
                    FROM
                      genres
                    UNION ALL
                    SELECT artist_id, store__genre_store_id
                    FROM
                      parent_genres)
SELECT artist_id
FROM
  artist_candidates
  NATURAL LEFT JOIN all_genres
GROUP BY artist_id
ORDER BY COUNT(store__genre_store_id = ANY (${genreIds})) DESC
        `
      )
      .then(getArtistIdFromResult)
  }

  if (!artistId) {
    logger.debug(`Artist ${artist.name} not found, inserting`)
    artistId = await tx
      .queryRowsAsync(
        // language=PostgreSQL
        sql`-- ensureArtistExists INSERT INTO artist
        INSERT
        INTO artist
          (artist_name, artist_source)
        VALUES (${artist.name}, ${sourceId})
        RETURNING artist_id
        `
      )
      .then(getArtistIdFromResult)
  }

  await tx.queryAsync(
    // language=PostgreSQL
    sql`-- ensureArtistExists INSERT INTO store__artist
    INSERT
    INTO store__artist
    (store__artist_store_id, store__artist_url, store_id, artist_id, store__artist_source)
    SELECT ${artist.id}
         , ${artist.url}
         , store_id
         , ${artistId}
         , ${sourceId}
    FROM
      store
    WHERE NOT EXISTS (SELECT store__artist_id
                      FROM
                        store__artist
                        NATURAL JOIN store
                      WHERE store__artist_store_id = ${artist.id}
                        AND store_url = ${storeUrl})
      AND store_url = ${storeUrl}
    ON CONFLICT ON CONSTRAINT store__artist_store__artist_url_key DO UPDATE
      SET store__artist_store_id = COALESCE(store__artist.store__artist_store_id, EXCLUDED.store__artist_store_id)
        , store__artist_source   = ${sourceId}
    `
  )

  const storeId = await queryStoreId(tx, storeUrl)

  if (artist.genres) {
    for (const genre of artist.genres) {
      // TODO: enough that the genreIds are queried as they should already be in the db?
      const { genreId } = await ensureGenreExists(tx, storeId, {
        storeGenreStoreId: genre.id,
        storeGenreName: genre.name,
        storeGenreUrl: genre.url
      })

      await tx.queryAsync(sql`-- ensureArtistExists INSERT artist__genre
INSERT INTO artist__genre (artist_id, genre_id)
VALUES (${artistId}, ${genreId})
ON CONFLICT DO NOTHING
      `)
    }
  }

  const res = await tx.queryRowsAsync(
    // language=PostgreSQL
    sql`-- ensureArtistExists SELECT store__artist_id AS "storeArtistId" FROM store__artist
    SELECT store__artist_id AS "storeArtistId"
    FROM
      store__artist
      NATURAL JOIN store
    WHERE store__artist_store_id = ${artist.id} OR 
          store__artist_url = ${artist.url}
    `
  )

  return { id: artistId, storeArtistId: res[0]?.storeArtistId, role: artist.role }
}

const getIsrcDebugData = async (isrc, storeTrackStoreId) =>
  pg.queryRowsAsync(sql`
    -- getIsrcDebugData
    SELECT (isrc_conflict_debug(${isrc}, ${storeTrackStoreId})).*
  `)

const ensureGenreExists = async (
  tx,
  storeId,
  { storeGenreStoreId, storeGenreName, storeGenreUrl, parentGenreId, parentStoreGenreStoreId }
) => {
  let genreId, storeGenreId, storeGenreParentId
  const storeGenreDetails = await tx.queryRowsAsync(sql`-- ensureGenreExists SELECT
SELECT genre_id AS "genreId", store__genre_id AS "storeGenreId", store__genre_parent_id AS "storeGenreParentId"
FROM
  store__genre
WHERE store_id = ${storeId}
  AND store__genre_store_id = ${storeGenreStoreId}
`)

  if (storeGenreDetails.length === 0) {
    const genreDetails = await tx.queryRowsAsync(sql`-- ensureGenreExists SELECT genre_id
SELECT genre_id AS "genreId"
FROM
  genre
WHERE genre_name = ${storeGenreName}
`)
    console.log({ genreDetails })
    genreId = genreDetails[0]?.genreId

    if (!genreId) {
      const insertedGenre = await tx.queryRowsAsync(sql`-- ensureGenreExists INSERT genre
INSERT INTO genre (genre_name, genre_parent)
VALUES (${storeGenreName}, ${parentGenreId})
RETURNING genre_id AS "genreId"
`)
      genreId = insertedGenre[0].genreId
    }

    const insertedStoreGenre = await tx.queryRowsAsync(sql`-- ensureGenreExists INSERT
INSERT INTO store__genre (store__genre_name, store__genre_store_id, store__genre_url, store__genre_parent_id, genre_id, store_id)
VALUES (${storeGenreName}, ${storeGenreStoreId}, ${storeGenreUrl}, ${parentStoreGenreStoreId}, ${genreId}, ${storeId})
RETURNING store__genre_id AS "storeGenreId", store__genre_parent_id AS "storeGenreParentId"
`)

    storeGenreId = insertedStoreGenre[0].storeGenreId
    storeGenreParentId = insertedStoreGenre[0].storeGenreParentId
  } else {
    genreId = storeGenreDetails[0].genreId
    storeGenreId = storeGenreDetails[0].storeGenreId
    storeGenreParentId = storeGenreDetails[0].storeGenreParentId
  }

  return { genreId, storeGenreId, storeGenreParentId }
}

const queryStoreId = async (tx, storeUrl) =>
  await tx
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- addStoreTrack SELECT store_id
      SELECT store_id
      FROM
        store
      WHERE store_url = ${storeUrl}
      `
    )
    .then(getFieldFromResult('store_id'))

module.exports.addStoreTrack = async (tx, storeUrl, labelId, releaseId, artists, track, sourceId) => {
  const getTrackIdFromResult = getFieldFromResult('track_id')

  const sortedArtists = R.sortBy(R.prop('id'), artists)

  const res = await tx.queryRowsAsync(
    // language=PostgreSQL
    sql`-- addStoreTrack SELECT track_id 1
    SELECT DISTINCT track_id
    FROM
      track
      NATURAL LEFT JOIN store__track
      NATURAL LEFT JOIN release__track
      NATURAL LEFT JOIN release
    WHERE store__track_store_id = ${track.id}
       OR (
        (release_catalog_number = ${track.release.catalog_number}
          OR release_isrc = ${track.release.isrc})
        AND release__track_track_number = ${track.track_number})
       OR track_isrc = ${track.isrc}
    `
  )

  if (res.length > 1) {
    logger.info(
      `Multiple tracks (${res.map(R.prop('track_id')).join(', ')}) found with store id: ${track.id} or ISRC: ${
        track.isrc
      } or catalog number: ${track.release.catalog_number} and track number: ${track.track_number}`
    )
  }

  let trackId = getTrackIdFromResult(res)

  if (trackId) {
    logger.info(
      `Track ${trackId} found with store id: ${track.id} or ISRC: ${track.isrc} or catalog number: ${track.release.catalog_number} and track number: ${track.track_number}`
    )
  } else {
    logger.info(
      `Track not found with with ISRC: ${track.isrc}, catalog number: ${track.release.catalog_number} and track number: ${track.track_number}, searching with name`
    )
    trackId = await tx
      .queryRowsAsync(
        // language=PostgreSQL
        sql`-- addStoreTrack SELECT track_id 2
        SELECT track_id
        FROM
          track
          NATURAL JOIN track__artist
          NATURAL JOIN artist
        WHERE LOWER(track_title) = LOWER(${track.title})
          AND ((${track.version}::TEXT IS NULL AND track_version IS NULL) OR
               LOWER(track_version) = LOWER(${track.version}))
        GROUP BY track_id
        HAVING ARRAY_AGG(artist_id ORDER BY artist_id) = ${R.pluck('id', sortedArtists)}
           AND ARRAY_AGG(track__artist_role ORDER BY artist_id) = ${R.pluck('role', sortedArtists)}
        `
      )
      .then(getTrackIdFromResult)
  }

  if (!trackId) {
    logger.debug('Track not found, inserting')
    try {
      trackId = await tx
        .queryRowsAsync(
          // language=PostgreSQL
          sql`-- addStoreTrack INSERT INTO track
          INSERT
          INTO track
          (track_title, track_version, track_duration_ms, track_isrc, track_source)
          VALUES (${track.title}, ${track.version}, ${track.duration_ms}, ${track.isrc}, ${sourceId})
          RETURNING track_id
          `
        )
        .then(getTrackIdFromResult)
      logger.debug(`Inserted new track with id: ${trackId}`)
    } catch (e) {
      logger.error(`Inserting track failed: ${e.toString()}, ${JSON.stringify(track).substring(0, 2000)}`)
      throw e
    }
  } else {
    try {
      await tx.queryAsync(
        // language=PostgreSQL
        sql`-- addStoreTrack UPDATE track
        UPDATE track
        SET track_duration_ms = COALESCE(track_duration_ms, ${track.duration_ms})
          , track_isrc        = COALESCE(track_isrc, ${track.isrc})
        WHERE track_id = ${trackId}
        `
      )
    } catch (e) {
      const debugData = await getIsrcDebugData(track.isrc, track.id)
      const [
        { track_id: firstId, track_title: firstTitle, track_version: firstVersion },
        { track_id: secondId, track_title: secondTitle, track_version: secondVersion }
      ] = debugData
      logger.error(
        `Updating track details failed: ${e.toString()}, 
Track ISRC: ${track.isrc}
Release ISRC: ${track.release?.isrc}
Release catalog number: ${track.release?.catalog_number}
Details: ${JSON.stringify(debugData, null, 2)}

Merge:
https://${apiURL}/admin/merge-tracks/${firstId}/to/${secondId} (${firstTitle} (${firstVersion}) -> ${secondTitle} (${secondVersion}))
https://${apiURL}/admin/merge-tracks/${secondId}/to/${firstId} (${secondTitle} (${secondVersion}) -> ${firstTitle} (${firstVersion}))`
      )
      throw e
    }
  }

  for (const { id, role } of artists) {
    await tx.queryAsync(
      // language=PostgreSQL
      sql`-- addStoreTrack INSERT INTO track__artist
      INSERT
      INTO track__artist
        (track_id, artist_id, track__artist_role)
      VALUES (${trackId}, ${id}, ${role})
      ON CONFLICT ON CONSTRAINT track__artist_track_id_artist_id_track__artist_role_key DO NOTHING
      `
    )
  }

  const storeId = await queryStoreId(tx, storeUrl)

  const [storeTrackDetails] = await tx.queryRowsAsync(
    // language=PostgreSQL
    sql`-- addStoreTrack SELECT store__track_id
    SELECT store__track_id
    FROM
      store__track
    WHERE store__track_store_id = ${track.id}
    `
  )

  if (storeTrackDetails && track.track_number) {
    const res = await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`-- addStoreTrack UPDATE store__track
      UPDATE store__track
      SET track_id                   = ${trackId}
        , store__track_url           = ${track.url}
        , store__track_released      = ${track.released}
        , store__track_published     = ${track.published}
        , store__track_bpm           = ${track.bpm}
        , store__track_store_details = ${track}
      WHERE store__track_store_id = ${track.id}
        AND store_id = ${storeId}
        AND NOT EXISTS (SELECT 1
                        FROM
                          release__track rt
                        WHERE release_id = ${releaseId}
                          AND rt.release__track_track_number = ${track.track_number})
      RETURNING store__track_id
        `
    )

    if (res.length === 0) {
      const [{ track_id, release_id, store__track_id }] = tx.queryRowsAsync(sql`
        SELECT track_id, release_id, store__track_id
        FROM
          release__track
        NATURAL JOIN store__track
        WHERE release_id = ${releaseId}
          AND release__track_track_number = ${track.track_number}
`)

      logger.warn(`Unable to set the track number for store__track: store: ${storeId}, store track: ${track.id}`, {
        track_id,
        release_id,
        store__track_id
      })
    }
  } else {
    try {
      await tx.queryRowsAsync(
        // language=PostgreSQL
        sql`-- addStoreTrack INSERT INTO store__track
        INSERT
        INTO store__track
        ( track_id, store_id, store__track_store_id, store__track_url, store__track_released, store__track_published
        , store__track_bpm, store__track_store_details, store__track_source)
        VALUES ( ${trackId}, ${storeId}, ${track.id}, ${track.url}, ${track.released}, ${track.published}, ${track.bpm}
               , ${track}, ${sourceId})
        ON CONFLICT ON CONSTRAINT store__track_store__track_store_id_store_id_key
          DO UPDATE
          SET track_id                   = excluded.track_id
            , store__track_url           = excluded.store__track_url
            , store__track_released      = excluded.store__track_released
            , store__track_published     = excluded.store__track_published
            , store__track_bpm           = excluded.store__track_bpm
            , store__track_store_details = excluded.store__track_store_details
        `
      )
    } catch (e) {
      logger.error(`addStoreTrack INSERT INTO store__track failed for track: ${e.toString()}, ${JSON.stringify(track)}`)
      logger.error(e)
      throw e
    }
  }

  const storeTrackId = await tx
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- addStoreTrack SELECT store__track_id
      SELECT store__track_id
      FROM
        store__track
      WHERE store_id = ${storeId}
        AND track_id = ${trackId}
        AND store__track_store_id = ${track.id}
      `
    )
    .then(getFieldFromResult('store__track_id'))

  for (const preview of track.previews) {
    await tx.queryAsync(
      // language=PostgreSQL
      sql`-- addStoreTrack INSERT INTO store__track_preview
      INSERT
      INTO store__track_preview
      ( store__track_id, store__track_preview_url, store__track_preview_format, store__track_preview_start_ms
      , store__track_preview_end_ms, store__track_preview_source)
      VALUES (${storeTrackId}, ${preview.url}, ${preview.format}, ${preview.start_ms}, ${preview.end_ms}, ${sourceId})
      ON CONFLICT DO NOTHING
      `
    )
    const previewId = await tx
      .queryRowsAsync(
        // language=PostgreSQL
        sql`-- addStoreTrack SELECT store__track_preview_id
        SELECT store__track_preview_id
        FROM
          store__track_preview
        WHERE store__track_preview_url = ${preview.url}
          AND store__track_id = ${storeTrackId}
        `
      )
      .then(getFieldFromResult('store__track_preview_id'))

    if (track.waveform) {
      await tx.queryAsync(
        // language=PostgreSQL
        sql`-- addStoreTrack INSERT INTO store__track_preview_waveform
        INSERT
        INTO store__track_preview_waveform
        (store__track_preview_id, store__track_preview_waveform_url, store__track_preview_waveform_source)
        VALUES (${previewId}, ${track.waveform.url}, ${sourceId})
        ON CONFLICT ON CONSTRAINT store__track_preview_waveform_store__track_preview_id_url_key DO NOTHING
        `
      )
    }
  }

  if (releaseId) {
    const releaseTrackNumberDetails = await tx.queryRowsAsync(sql`-- addStoreTrack SELECT track_id AS "existingTrackIdWithTrackNumber"
SELECT track_id AS "existingTrackIdWithTrackNumber"
FROM
  release__track rt
WHERE release_id = ${releaseId}
  AND rt.release__track_track_number = ${track.track_number}
  AND track_id <> ${trackId}`)

    if (releaseTrackNumberDetails.length > 0) {
      const [{ existingTrackIdWithTrackNumber }] = res
      logger.warn(
        `Track number ${track.track_number} already exists for release ${releaseId}, track ${existingTrackIdWithTrackNumber}`
      )

      delete track.track_number
    }

    const [releaseTrackDetails] = await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`-- addStoreTrack SELECT release__track_id FROM release__track
      SELECT release__track_track_number AS "trackNumber"
      FROM
        release__track
      WHERE release_id = ${releaseId}
        AND track_id = ${trackId}
      `
    )

    if (!releaseTrackDetails) {
      console.log('Inserting release track', { releaseId, trackId, number: track.track_number })
      await tx.queryAsync(
        // language=PostgreSQL
        sql`-- addStoreTrack INSERT INTO release__track
        INSERT
        INTO release__track
          (release_id, track_id, release__track_track_number)
        VALUES (${releaseId}, ${trackId}, ${track.track_number})
        `
      )
    } else {
      console.log('Updating release track', { releaseId, trackId, number: track.track_number })

      const { trackNumber } = releaseTrackDetails
      if (track.track_number !== undefined && trackNumber !== track.track_number) {
        logger.warn(
          `Overwriting track number for release (${releaseId}). Previous: ${trackNumber}, new: ${track.track_number}`
        )
      }

      await tx.queryAsync(
        // language=PostgreSQL
        sql`-- addStoreTrack UPDATE release__track
          UPDATE release__track
          SET release__track_track_number = COALESCE(${track.track_number}, release__track.release__track_track_number)
          WHERE track_id = ${trackId}
            AND release_id = ${releaseId}
          `
      )
    }
  }

  if (labelId) {
    // TODO: associate label to release instead of track?
    await tx.queryAsync(
      // language=PostgreSQL
      sql`-- addStoreTrack INSERT INTO track__label
      INSERT
      INTO track__label
        (track_id, label_id)
      VALUES (${trackId}, ${labelId})
      ON CONFLICT ON CONSTRAINT track__label_track_id_label_id_key DO NOTHING
      `
    )
  }

  if (track.key) {
    await tx.queryAsync(
      // language=PostgreSQL
      sql`-- addStoreTrack INSERT INTO track__key
      INSERT
      INTO track__key
        (track_id, key_id, track__key_source)
      SELECT ${trackId}
           , key_id
           , ${sourceId}
      FROM
        key_name
      WHERE key_name = ${track.key}
      ON CONFLICT ON CONSTRAINT track__key_track_id_key_id_key DO NOTHING
      `
    )
  }

  if (track.genres) {
    let genres = []
    for (const genre of track.genres) {
      const { genreId } = await ensureGenreExists(tx, storeId, {
        storeGenreStoreId: genre.id,
        storeGenreName: genre.name,
        storeGenreUrl: genre.url
      })
      genres.push(genreId)
    }

    for (const genreId of genres) {
      await tx.queryAsync(sql`-- addStoreTrack INSERT INTO track__genre
INSERT INTO track__genre (track_id, genre_id)
VALUES (${trackId}, ${genreId})
ON CONFLICT DO NOTHING
`)
      for (const { id: artistId } of artists) {
        await tx.queryAsync(sql`-- addStoreTrack INSERT INTO artist__genre
INSERT INTO artist__genre (artist_id, genre_id)
VALUES (${artistId}, ${genreId})
ON CONFLICT DO NOTHING
`)
      }
    }
  }

  tx.queryAsync(
    // language=PostgreSQL
    sql`-- addStoreTrack INSERT INTO track_details
    INSERT INTO track_details (track_id, track_details)
    SELECT ${trackId}, ROW_TO_JSON(track_details(ARRAY_AGG(${trackId}::INT)))
    ON CONFLICT ON CONSTRAINT track_details_track_id_key DO UPDATE
      SET track_details         = EXCLUDED.track_details
        , track_details_updated = NOW()
    `
  )

  return trackId
}

module.exports.queryFollowRegexes = (store = undefined) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryFollowRegexes
    SELECT regex
         , type
         , LOWER(store_name) AS "storeName"
    FROM
      ((SELECT store_name, store_artist_regex AS regex, 'artist' AS type FROM store)
       UNION ALL
       (SELECT store_name, store_label_regex AS regex, 'label' AS type FROM store)
       UNION ALL
       (SELECT store_name
             , store_playlist_type_regex                          AS regex
             , COALESCE(store_playlist_type_store_id, 'playlist') AS type
        FROM
          store
          NATURAL JOIN store_playlist_type
        ORDER BY store_playlist_type_priority)) AS a
    WHERE ${store}::TEXT IS NULL
       OR store_name = ${store}
    `
  )
