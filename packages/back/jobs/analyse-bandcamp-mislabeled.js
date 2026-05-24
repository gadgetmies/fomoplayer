const logger = require('fomoplayer_shared').logger(__filename)
const { detectMislabeledCandidates } = require('../routes/admin/db')
const {
  getCachedMislabeled,
  getEntitiesToCheck,
  upsertConfirmedMislabeled,
  removeUnconfirmedMislabeled,
  recordEntityChecks,
} = require('../routes/shared/db/bandcampMislabeledCache')
const {
  getPageDetailsAsync,
  static: { isRateLimited, nameSubdomainSimilarity, getSubdomain },
} = require('../routes/stores/bandcamp/bandcamp-api')

const TYPES = ['artist', 'label']
const WRONG_TYPE = { artist: 'label', label: 'artist' }
const BATCH_SIZE = 50

// Stored artist/label URLs are subdomain roots; the discography grid that
// page-type detection relies on is rendered on the `/music` page, so classify
// against that.
const musicUrl = (url) => `${url.replace(/\/+$/, '')}/music`

// Classify Bandcamp artists/labels by fetching their page and checking whether
// it is actually the other entity type. Each run re-verifies currently-flagged
// entities and the cheap heuristic suspects, plus a rotating batch of the
// least-recently-checked entities so the whole catalogue is swept over time.
// The sweep is what catches band-account labels whose name matches their
// subdomain (e.g. modernconveniences) — these have no URL collision and a
// perfect name/subdomain match, so the heuristics alone never surface them.
// Stops early when Bandcamp starts rate limiting and resumes next run.
const analyseBandcampMislabeled = async () => {
  const byKey = new Map()
  const add = (type, id, url) => {
    if (url) byKey.set(`${type}:${id}`, { type, id, url })
  }

  // Re-verify known suspects first so a rate-limited run still refreshes them.
  for (const type of TYPES) {
    for (const c of await getCachedMislabeled(type)) add(type, c.id, c.url)
    for (const c of await detectMislabeledCandidates(type)) add(type, c.id, c.url)
  }
  for (const e of await getEntitiesToCheck(BATCH_SIZE)) add(e.type, e.id, e.url)

  const confirmed = { artist: [], label: [] }
  const checked = { artist: [], label: [] }
  let rateLimited = false

  for (const { type, id, url } of byKey.values()) {
    if (isRateLimited()) {
      rateLimited = true
      logger.warn('Rate limited while analysing mislabeled Bandcamp entities, stopping early')
      break
    }
    checked[type].push(id)
    let details
    try {
      details = await getPageDetailsAsync(musicUrl(url))
    } catch (e) {
      logger.warn(`Failed to fetch ${url} while analysing mislabeled entities: ${e.message}`)
      continue
    }
    if (details && details.type === WRONG_TYPE[type]) {
      const similarity = Number(nameSubdomainSimilarity(details.name, getSubdomain(url)).toFixed(2))
      confirmed[type].push({
        id,
        url,
        reason: `page_is_${WRONG_TYPE[type]}`,
        similarity,
        detectedPageType: details.type,
      })
    }
  }

  const summary = { rateLimited }
  for (const type of TYPES) {
    await upsertConfirmedMislabeled(type, confirmed[type])
    await recordEntityChecks(type, checked[type])
    await removeUnconfirmedMislabeled(
      type,
      checked[type],
      confirmed[type].map((c) => c.id),
    )
    summary[type] = { checked: checked[type].length, confirmed: confirmed[type].length }
  }

  logger.info(`Bandcamp mislabeled analysis complete: ${JSON.stringify(summary)}`)
  return { success: true, result: summary }
}

module.exports = { analyseBandcampMislabeled }
