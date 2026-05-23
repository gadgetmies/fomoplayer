const logger = require('fomoplayer_shared').logger(__filename)
const { detectMislabeledCandidates } = require('../routes/admin/db')
const {
  getCachedMislabeled,
  upsertConfirmedMislabeled,
  removeUnconfirmedMislabeled,
} = require('../routes/shared/db/bandcampMislabeledCache')
const {
  getPageDetailsAsync,
  static: { isRateLimited },
} = require('../routes/stores/bandcamp/bandcamp-api')

const TYPES = ['artist', 'label']

// Confirm heuristic-flagged Bandcamp entities (and re-verify previously cached
// ones) by fetching their page and checking whether it is actually the other
// entity type. Only confirmed entities stay cached; the page fetch filters out
// the heuristics' false positives (e.g. an artist whose name merely differs
// from their subdomain). Stops early when Bandcamp starts rate limiting.
const analyseBandcampMislabeled = async () => {
  const summary = {}

  for (const type of TYPES) {
    const wrongType = type === 'artist' ? 'label' : 'artist'

    const candidates = await detectMislabeledCandidates(type)
    const cached = await getCachedMislabeled(type)

    const byId = new Map()
    for (const row of cached) byId.set(row.id, row)
    for (const candidate of candidates) byId.set(candidate.id, candidate)

    const confirmed = []
    const checkedIds = []
    let rateLimited = false

    for (const candidate of byId.values()) {
      if (isRateLimited()) {
        rateLimited = true
        logger.warn(`Rate limited while analysing mislabeled ${type}s, stopping early`)
        break
      }
      checkedIds.push(candidate.id)
      let details
      try {
        details = await getPageDetailsAsync(candidate.url)
      } catch (e) {
        logger.warn(`Failed to fetch ${candidate.url} while analysing mislabeled ${type}s: ${e.message}`)
        continue
      }
      if (details && details.type === wrongType) {
        confirmed.push({ ...candidate, detectedPageType: details.type })
      }
    }

    await upsertConfirmedMislabeled(type, confirmed)
    await removeUnconfirmedMislabeled(
      type,
      checkedIds,
      confirmed.map((c) => c.id),
    )

    summary[type] = {
      candidates: byId.size,
      checked: checkedIds.length,
      confirmed: confirmed.length,
      rateLimited,
    }
  }

  logger.info(`Bandcamp mislabeled analysis complete: ${JSON.stringify(summary)}`)
  return { success: true, result: summary }
}

module.exports = { analyseBandcampMislabeled }
