#!/usr/bin/env node

// Re-credits Bandcamp tracks that have no artists at all.
//
// Converting a mislabeled artist into a label (Admin > Mislabeled) removes the
// artist's track credits. The real per-track artists only come back through
// the label re-fetch, which the convert endpoint used to leave to an optional
// "Re-fetch artists" prompt. Tracks whose only artist was converted without
// that re-fetch are left with no artists, and the track lists, which require an
// author, hide them.
//
// This script re-fetches only the Bandcamp releases holding such tracks, parses
// them through the ingestion transform and credits only the artist-less tracks
// (tracks that already have artists are left alone). A release on a subdomain
// stored as a label is parsed as a label page, unless the subdomain also keeps
// an artist of the same name (an artist's own page converted by mistake); any
// other release keeps the page type Bandcamp's page shows. A track whose parsed
// authors would only be the label (or "Various Artists") is skipped and
// reported, so the label is not stored as an artist again.
//
// It is DRY-RUN by default. Flags:
//   --apply              write the credits (otherwise only report)
//   --track-ids=1,2,3    only these (internal) track ids
//   --limit=N            stop after N releases (default: all)
//
// Needs the backend env (DATABASE_URL, STATEMENT_TIMEOUT), e.g.
// `npx dotenv -e .env.development -- node scripts/repair-bandcamp-artistless-tracks.js`.
// Applied tracks drop out of the candidate set, so a run stopped by a Bandcamp
// rate limit continues where it left off when run again.

const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg
const { bandcampReleasesTransform } = require('fomoplayer_browser_extension/src/js/transforms/bandcamp')
const { getReleaseAsync } = require('../routes/stores/bandcamp/bandcamp-api')
const { storeUrl: STORE_URL } = require('../routes/stores/bandcamp/logic')
const { reattributeTracksArtists } = require('../routes/stores/bandcamp/db')

const RELEASE_URL_PATTERN = '^https://[a-z0-9-]+\\.bandcamp\\.com/'

// One row per artist-less Bandcamp track: its Bandcamp release URL, the labels
// it is credited to, and the label stored for the release's subdomain, if any.
const queryArtistlessTracks = (trackIds) =>
  pg.queryRowsAsync(sql`-- repairBandcampArtistlessTracks candidates
SELECT st.track_id                                       AS "trackId"
     , st.store__track_store_id                          AS "storeTrackId"
     , t.track_title                                     AS title
     , (SELECT MIN(sr.store__release_url)
        FROM release__track rt
          JOIN store__release sr ON sr.release_id = rt.release_id
        WHERE rt.track_id = st.track_id
          AND sr.store__release_url ~ ${RELEASE_URL_PATTERN}) AS "releaseUrl"
     , (SELECT COALESCE(JSON_AGG(l.label_name), '[]')
        FROM track__label tl
          JOIN label l ON l.label_id = tl.label_id
        WHERE tl.track_id = st.track_id)                 AS "labelNames"
FROM
  store__track st
  JOIN store s ON s.store_id = st.store_id
  JOIN track t ON t.track_id = st.track_id
WHERE s.store_url = ${STORE_URL}
  AND NOT EXISTS (SELECT 1 FROM track__artist ta WHERE ta.track_id = st.track_id)
  AND (${trackIds ?? null}::INT[] IS NULL OR st.track_id = ANY (${trackIds ?? null}::INT[]))
ORDER BY st.track_id`)

const querySubdomainLabelName = async (releaseUrl) => {
  const origin = new URL(releaseUrl).origin
  const [row] = await pg.queryRowsAsync(sql`-- repairBandcampArtistlessTracks subdomain label
SELECT l.label_name AS name
FROM
  store__label sl
  JOIN store s ON s.store_id = sl.store_id
  JOIN label l ON l.label_id = sl.label_id
WHERE s.store_url = ${STORE_URL}
  AND (sl.store__label_url = ${origin} OR sl.store__label_url LIKE ${`${origin}/%`})
ORDER BY sl.store__label_id
LIMIT 1`)
  return row?.name ?? null
}

const querySubdomainArtistName = async (releaseUrl) => {
  const origin = new URL(releaseUrl).origin
  const [row] = await pg.queryRowsAsync(sql`-- repairBandcampArtistlessTracks subdomain artist
SELECT a.artist_name AS name
FROM
  store__artist sa
  JOIN store s ON s.store_id = sa.store_id
  JOIN artist a ON a.artist_id = sa.artist_id
WHERE s.store_url = ${STORE_URL}
  AND (sa.store__artist_url = ${origin} OR sa.store__artist_url LIKE ${`${origin}/%`})
ORDER BY sa.store__artist_id
LIMIT 1`)
  return row?.name ?? null
}

const sameName = (a) => (b) => (a || '').trim().toLocaleLowerCase() === (b || '').trim().toLocaleLowerCase()
const VARIOUS = ['various artists', 'various', 'v/a', 'va']

// The parse has no real artist when every author is a label the track is
// credited to, the release's label or "Various Artists".
const onlyLabelAuthors = (parsed, labelNames) =>
  parsed.artists
    .filter(({ role }) => role === 'author')
    .every(({ name }) => labelNames.some(sameName(name)) || VARIOUS.includes((name || '').trim().toLocaleLowerCase()))

const groupByRelease = (tracks) =>
  tracks.reduce((groups, track) => {
    if (!track.releaseUrl) return groups
    ;(groups[track.releaseUrl] ??= []).push(track)
    return groups
  }, {})

const describeArtists = (artists) => artists.map(({ name, role }) => `${name} (${role})`).join(', ')

module.exports.repairBandcampArtistlessTracks = async ({
  apply = false,
  trackIds,
  limit,
  getRelease = getReleaseAsync,
  log = console.log,
} = {}) => {
  const candidates = await queryArtistlessTracks(trackIds)
  const releases = Object.entries(groupByRelease(candidates)).slice(0, limit ?? undefined)
  const summary = {
    candidates: candidates.length,
    withoutRelease: candidates.filter(({ releaseUrl }) => !releaseUrl).map(({ trackId }) => trackId),
    releases: releases.length,
    repaired: 0,
    labelOnly: [],
    missingFromRelease: [],
    failedReleases: [],
    rateLimited: false,
  }

  for (const [releaseUrl, tracks] of releases) {
    const subdomainLabel = await querySubdomainLabelName(releaseUrl)
    let release
    try {
      release = await getRelease(releaseUrl)
    } catch (e) {
      if (e.isRateLimit) {
        summary.rateLimited = true
        log(`Rate limited by Bandcamp at ${releaseUrl}; run again later to continue`)
        break
      }
      summary.failedReleases.push({
        releaseUrl,
        error: e.statusCode ?? e.message,
        trackIds: tracks.map((t) => t.trackId),
      })
      log(`Failed to fetch ${releaseUrl}: ${e.statusCode ?? e.message}`)
      continue
    }
    // An artist's own page converted to a label by mistake keeps both an artist
    // and a label of the page's name: the page is parsed as the artist's.
    const subdomainArtist = await querySubdomainArtistName(releaseUrl)
    const isOwnArtistPage = Boolean(subdomainLabel && subdomainArtist && sameName(subdomainLabel)(subdomainArtist))
    const pageType = isOwnArtistPage ? 'artist' : subdomainLabel ? 'label' : release.pageType
    const pageName = isOwnArtistPage ? subdomainArtist : (subdomainLabel ?? release.pageName)
    const parsedById = new Map(
      bandcampReleasesTransform([{ ...release, pageType, pageName }]).map((parsed) => [String(parsed.id), parsed]),
    )
    // Without a stored artist for the subdomain, a credit naming only the page
    // is as likely to be a label (e.g. "Othercide Records") as the artist.
    const pageNameIsUnknown = pageType === 'label' || !subdomainArtist
    const labelNames = (track) =>
      [...track.labelNames, subdomainLabel, pageNameIsUnknown ? pageName : null]
        .filter(Boolean)
        .filter((name) => !(isOwnArtistPage && sameName(name)(subdomainArtist)))

    const toCredit = []
    for (const track of tracks) {
      const parsed = parsedById.get(String(track.storeTrackId))
      if (!parsed) {
        summary.missingFromRelease.push({ trackId: track.trackId, title: track.title, releaseUrl })
        log(`  ${track.trackId} "${track.title}": not on ${releaseUrl} any more`)
        continue
      }
      if (onlyLabelAuthors(parsed, labelNames(track))) {
        summary.labelOnly.push({ trackId: track.trackId, title: track.title, artists: describeArtists(parsed.artists) })
        log(
          `  ${track.trackId} "${track.title}": skipped, only the label as author (${describeArtists(parsed.artists)})`,
        )
        continue
      }
      log(`  ${track.trackId} "${track.title}" -> ${describeArtists(parsed.artists)}`)
      toCredit.push(parsed)
    }

    log(`${releaseUrl} (${pageType ?? 'detected'}: ${pageName}): ${toCredit.length}/${tracks.length} to credit`)
    if (apply && toCredit.length > 0) {
      summary.repaired += await reattributeTracksArtists(toCredit)
    }
  }

  return summary
}

if (require.main === module) {
  const args = process.argv.slice(2)
  const flagValue = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const apply = args.includes('--apply')
  const trackIds = flagValue('track-ids')?.split(',').map(Number)
  const limit = flagValue('limit') ? Number(flagValue('limit')) : undefined

  module.exports
    .repairBandcampArtistlessTracks({ apply, trackIds, limit })
    .then((summary) => {
      console.log(JSON.stringify({ ...summary, apply }, null, 2))
      if (!apply) console.log('Dry run: nothing written. Re-run with --apply to credit the tracks.')
      process.exit(0)
    })
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
