#!/usr/bin/env node

// Remediation for Bandcamp artist/label metadata corrupted by the old
// transform, which derived an artist's store id/url from the album page's
// subdomain. On a *label* page that subdomain is the label, so:
//
//   1. every artist released through a label inherited the label's URL and,
//      because `store__artist_url` is UNIQUE, they collapsed into whichever
//      artist was ingested first (e.g. modernconveniences -> Akuratyde);
//   2. label/"Various Artists" names were inserted straight into `artist`
//      (e.g. Fokuz Recordings, Sound Museum).
//
// The transform fix (packages/browser-extension/src/js/transforms/bandcamp.js)
// stops this for new ingestion. This script repairs already-stored data.
//
// It is DRY-RUN by default. Phases:
//   (report)            always: list high-confidence bad rows + review set.
//   --apply             Phase A: null the bogus store__artist url/store_id so
//                        the rows stop acting as merge magnets (non-destructive).
//   --apply --reimport  Phase B: re-fetch each affected release through the
//                        fixed pipeline and re-attribute its tracks to the
//                        correct artists/label (needs *.bandcamp.com network).
//   --apply --delete-orphans
//                        Phase C: delete bad artist rows left with no tracks
//                        and no followers (the empty label-as-artist shells).
//
// Always validate against a staging copy before running with --apply on prod.

const BPromise = require('bluebird')
const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg
const logger = require('fomoplayer_shared').logger(__filename)
const { bandcampReleasesTransform } = require('fomoplayer_browser_extension/src/js/transforms/bandcamp')
const {
  getReleaseAsync,
  getLabelAsync,
  static: { isRateLimited, nameSubdomainSimilarity, getSubdomain },
} = require('../routes/stores/bandcamp/bandcamp-api')
const {
  ensureArtistExists,
  ensureReleaseExists,
  ensureLabelExists,
  addStoreTrack,
} = require('../routes/shared/db/store')
const { queryLabelForRelease } = require('../routes/shared/db/release')
const { insertSource } = require('../jobs/watches/shared/db')

const STORE_URL = 'https://bandcamp.com'

const args = process.argv.slice(2)
const hasFlag = (name) => args.includes(`--${name}`)
const flagValue = (name) => {
  const prefix = `--${name}=`
  const found = args.find((a) => a.startsWith(prefix))
  return found ? found.slice(prefix.length) : undefined
}

const apply = hasFlag('apply')
const reimport = hasFlag('reimport')
const deleteOrphans = hasFlag('delete-orphans')
const explicitUrls = (flagValue('reimport') || '')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean)

const log = (...m) => console.log(...m)

const SIMILARITY_THRESHOLD = 0.5

// store__artist rows whose URL is also a known label URL: the highest-confidence
// signal that the "artist" is really a label page, and the magnet that merged
// distinct artists together.
const queryCollisionRows = () =>
  pg.queryRowsAsync(sql`-- fix-bandcamp collision rows
    SELECT sa.store__artist_id AS "storeArtistId"
         , sa.artist_id        AS "artistId"
         , a.artist_name       AS "artistName"
         , sa.store__artist_url AS url
         , l.label_name        AS "labelName"
    FROM
      store__artist sa
      JOIN store s ON s.store_id = sa.store_id AND s.store_url = ${STORE_URL}
      JOIN artist a ON a.artist_id = sa.artist_id
      JOIN store__label sl ON sl.store_id = sa.store_id AND sl.store__label_url = sa.store__artist_url
      JOIN label l ON l.label_id = sl.label_id
    WHERE sa.store__artist_url IS NOT NULL
    ORDER BY a.artist_name`)

// Lower-confidence: Bandcamp artists whose subdomain slug doesn't resemble their
// name. Often a magnet (artist keyed to a label page) but also legitimately a
// vanity handle, so this is reported for human review, never auto-fixed.
const queryReviewRows = () =>
  pg.queryRowsAsync(sql`-- fix-bandcamp review rows
    SELECT sa.artist_id AS "artistId", a.artist_name AS "artistName", sa.store__artist_url AS url
    FROM
      store__artist sa
      JOIN store s ON s.store_id = sa.store_id AND s.store_url = ${STORE_URL}
      JOIN artist a ON a.artist_id = sa.artist_id
    WHERE sa.store__artist_url ~ '^https?://[^/]+\\.bandcamp\\.com/?$'`)

const queryArtistCounts = (artistId) =>
  pg
    .queryRowsAsync(sql`-- fix-bandcamp artist counts
      SELECT COUNT(DISTINCT ta.track_id)   AS tracks
           , COUNT(DISTINCT rt.release_id) AS releases
      FROM
        track__artist ta
        LEFT JOIN release__track rt ON rt.track_id = ta.track_id
      WHERE ta.artist_id = ${artistId}`)
    .then(([r]) => r)

const queryAffectedReleaseUrls = (artistIds) =>
  pg
    .queryRowsAsync(sql`-- fix-bandcamp affected releases
      SELECT DISTINCT sr.store__release_url AS url
      FROM
        track__artist ta
        JOIN release__track rt ON rt.track_id = ta.track_id
        JOIN store__release sr ON sr.release_id = rt.release_id
        JOIN store s ON s.store_id = sr.store_id AND s.store_url = ${STORE_URL}
      WHERE ta.artist_id = ANY (${artistIds})`)
    .then((rows) => rows.map((r) => r.url))

const stripBogusUrls = (storeArtistIds) =>
  pg.queryAsync(sql`-- fix-bandcamp strip bogus urls
    UPDATE store__artist
    SET store__artist_url = NULL, store__artist_store_id = NULL
    WHERE store__artist_id = ANY (${storeArtistIds})`)

// Re-fetch one release through the fixed scraper/transform and re-attribute its
// tracks. Mirrors addStoreTrackToUsers' global half, then removes the stale
// links that still point at the magnet artists.
const reimportRelease = async (releaseUrl, badArtistIds, sourceId) => {
  const release = await getReleaseAsync(releaseUrl)
  const tracks = bandcampReleasesTransform([release])
  if (tracks.length === 0) {
    log(`  - ${releaseUrl}: no playable tracks, skipping`)
    return { tracks: 0, repointed: 0 }
  }

  return BPromise.using(pg.getTransaction(), async (tx) => {
    let repointed = 0
    for (const track of tracks) {
      const labelId = track.label ? (await ensureLabelExists(tx, STORE_URL, track.label, sourceId)).labelId : undefined

      const correctArtists = []
      for (const artist of track.artists) {
        correctArtists.push(await ensureArtistExists(tx, STORE_URL, artist, sourceId))
      }
      const correctArtistIds = correctArtists.map((a) => a.id)

      const releaseId = track.release
        ? await ensureReleaseExists(tx, STORE_URL, track.release, correctArtists, sourceId)
        : undefined
      const effectiveLabelId = (releaseId && (await queryLabelForRelease(tx, releaseId))) || labelId

      const trackId = await addStoreTrack(tx, STORE_URL, effectiveLabelId, releaseId, correctArtists, track, sourceId)

      const res = await tx.queryAsync(sql`-- fix-bandcamp repoint track__artist
        DELETE FROM track__artist
        WHERE track_id = ${trackId}
          AND artist_id = ANY (${badArtistIds})
          AND artist_id <> ALL (${correctArtistIds})`)
      repointed += res.rowCount || 0
    }
    return { tracks: tracks.length, repointed }
  })
}

const deleteOrphanArtists = (artistIds) =>
  BPromise.using(pg.getTransaction(), async (tx) => {
    const orphans = await tx.queryRowsAsync(sql`-- fix-bandcamp find orphans
      SELECT a.artist_id AS "artistId", a.artist_name AS "artistName"
      FROM artist a
      WHERE a.artist_id = ANY (${artistIds})
        AND NOT EXISTS (SELECT 1 FROM track__artist ta WHERE ta.artist_id = a.artist_id)
        AND NOT EXISTS (
              SELECT 1
              FROM store__artist_watch saw
                JOIN store__artist sa ON sa.store__artist_id = saw.store__artist_id
              WHERE sa.artist_id = a.artist_id)`)

    const ids = orphans.map((o) => o.artistId)
    if (ids.length === 0) return []
    await tx.queryAsync(sql`DELETE FROM artist__genre WHERE artist_id = ANY (${ids})`)
    await tx.queryAsync(sql`DELETE FROM store__artist WHERE artist_id = ANY (${ids})`)
    await tx.queryAsync(sql`DELETE FROM artist WHERE artist_id = ANY (${ids})`)
    return orphans
  })

const main = async () => {
  log(`Bandcamp artist/label remediation (${apply ? 'APPLY' : 'DRY-RUN'})\n`)

  const collisions = await queryCollisionRows()
  log(`High-confidence (artist URL collides with a label URL): ${collisions.length}`)
  for (const row of collisions) {
    const counts = await queryArtistCounts(row.artistId)
    log(
      `  artist#${row.artistId} "${row.artistName}" <- label "${row.labelName}" ${row.url} ` +
        `(${counts.tracks} tracks, ${counts.releases} releases)`,
    )
  }

  const reviewRows = (await queryReviewRows()).filter(
    (r) => nameSubdomainSimilarity(r.artistName, getSubdomain(r.url)) < SIMILARITY_THRESHOLD,
  )
  log(`\nFor review (subdomain slug != artist name, may be a vanity handle): ${reviewRows.length}`)
  for (const row of reviewRows.slice(0, 50)) {
    log(`  artist#${row.artistId} "${row.artistName}" ${row.url}`)
  }
  if (reviewRows.length > 50) log(`  ... and ${reviewRows.length - 50} more`)

  const badArtistIds = collisions.map((r) => r.artistId)
  const badStoreArtistIds = collisions.map((r) => r.storeArtistId)

  if (!apply) {
    log('\nDry run: pass --apply to strip the bogus URLs, --apply --reimport to re-attribute tracks.')
    return
  }

  if (badStoreArtistIds.length > 0) {
    await stripBogusUrls(badStoreArtistIds)
    log(`\nPhase A: cleared bogus URL/store id on ${badStoreArtistIds.length} store__artist row(s).`)
  }

  if (reimport) {
    let releaseUrls = explicitUrls
    if (releaseUrls.length === 0 && badArtistIds.length > 0) {
      releaseUrls = await queryAffectedReleaseUrls(badArtistIds)
    }
    // Allow passing label/artist page URLs: expand them to release URLs.
    const expanded = []
    for (const url of releaseUrls) {
      if (/\/(album|track)\//.test(url)) {
        expanded.push(url)
      } else {
        try {
          const { releaseUrls: urls } = await getLabelAsync(url)
          expanded.push(...urls)
        } catch (e) {
          log(`  ! could not expand ${url}: ${e.message}`)
        }
      }
    }
    const unique = [...new Set(expanded)]
    log(`\nPhase B: re-importing ${unique.length} release(s).`)
    const sourceId = await insertSource({ operation: 'fixBandcampArtistLabelMetadata' })
    let repointedTotal = 0
    for (const url of unique) {
      if (isRateLimited()) {
        log('  rate limited, stopping re-import early')
        break
      }
      try {
        const { tracks, repointed } = await reimportRelease(url, badArtistIds, sourceId)
        repointedTotal += repointed
        log(`  - ${url}: ${tracks} tracks, ${repointed} stale link(s) removed`)
      } catch (e) {
        log(`  ! ${url}: ${e.message}`)
      }
    }
    log(`Phase B: removed ${repointedTotal} stale artist link(s).`)
  }

  if (deleteOrphans) {
    const removed = await deleteOrphanArtists(badArtistIds)
    log(`\nPhase C: deleted ${removed.length} orphaned artist shell(s).`)
    for (const o of removed) log(`  artist#${o.artistId} "${o.artistName}"`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error('Remediation failed', e)
    process.exit(1)
  })
