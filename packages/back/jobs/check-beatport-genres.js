/**
 * Keeps the in-code Beatport genre cache (routes/stores/beatport/genres.js) in
 * sync with reality. The catalog rarely changes, so the genres are cached rather
 * than fetched per request; this job fetches the live set and alerts when genres
 * are added or renamed so a developer can update the cached list.
 */
const bpApi = require('../routes/stores/beatport/bp-api')
const { genres: cachedGenres } = require('../routes/stores/beatport/genres')
const { scheduleEmail } = require('../services/mailer')
const logger = require('fomoplayer_shared').logger(__filename)

module.exports = async () => {
  let liveGenres
  try {
    liveGenres = await bpApi.getGenres()
  } catch (e) {
    logger.error(`Failed to fetch Beatport genres: ${e.message}`)
    return { success: false, result: { error: e.message } }
  }

  const cachedById = new Map(cachedGenres.map((genre) => [String(genre.id), genre]))
  const pick = ({ id, name, slug }) => ({ id, name, slug })

  const added = liveGenres.filter((genre) => !cachedById.has(String(genre.id))).map(pick)
  const renamed = liveGenres
    .filter((genre) => {
      const cached = cachedById.get(String(genre.id))
      return cached && (cached.name !== genre.name || cached.slug !== genre.slug)
    })
    .map((genre) => ({ ...pick(genre), cached: pick(cachedById.get(String(genre.id))) }))

  if (added.length === 0 && renamed.length === 0) {
    logger.info(`Beatport genre cache is up to date (${liveGenres.length} genres)`)
    return { success: true, result: { genreCount: liveGenres.length } }
  }

  const report = { added, renamed }
  logger.warn(`Beatport genre cache is out of date`, report)

  const { ADMIN_EMAIL_SENDER, ADMIN_EMAIL_RECIPIENT } = process.env
  if (ADMIN_EMAIL_SENDER && ADMIN_EMAIL_RECIPIENT) {
    await scheduleEmail(
      ADMIN_EMAIL_SENDER,
      ADMIN_EMAIL_RECIPIENT,
      'Beatport genres changed — update the cached genre list',
      `Update packages/back/routes/stores/beatport/genres.js:\n\n${JSON.stringify(report, null, 2)}`,
    )
  }

  return { success: true, result: report }
}
