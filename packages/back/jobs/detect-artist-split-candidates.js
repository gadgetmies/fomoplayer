const logger = require('fomoplayer_shared').logger(__filename)
const { getArtistsForSplitScan, flagArtistSplitCandidate } = require('../routes/shared/db/artistSplit')
const { hasSplitSeparators, suggestArtistSplit } = require('../routes/admin/artist-split-logic')

// Flag artists whose name looks like it bundles several artists (e.g. a
// Bandcamp byline "Sleepnet & Lumen" stored as one artist), so an admin can
// split them into the real individual artists. Detection only; the repair is
// admin-driven so genuine compound names ("Camo & Krooked") are not split.
module.exports = async () => {
  const artists = await getArtistsForSplitScan()
  let flagged = 0

  for (const { artistId, name } of artists) {
    if (!hasSplitSeparators(name)) continue
    const suggestions = suggestArtistSplit(name)
    if (suggestions.length < 2) continue
    await flagArtistSplitCandidate({ artistId, name, suggestions })
    flagged++
  }

  logger.info(`Artist split candidate scan: ${flagged} flagged of ${artists.length} artists`)
  return { success: true, result: { scanned: artists.length, flagged } }
}
