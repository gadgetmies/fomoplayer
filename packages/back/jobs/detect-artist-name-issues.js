const logger = require('fomoplayer_shared').logger(__filename)
const { getArtistsForNameIssueScan, flagArtistNameIssue } = require('../routes/shared/db/artistNameIssue')
const { detectArtistNameIssues } = require('../routes/admin/artist-name-issue-logic')

// Flag artists whose name was polluted by track-title or version metadata
// at import time (e.g. "feat. Bar", "Foo (Bar Remix)", "(Foo)", trailing
// punctuation), so an admin can rename / merge / delete the record.
// Detection only; the repair is admin-driven so legitimate names that
// happen to contain a suspicious token (parens, version words, &) are not
// rewritten blindly.
module.exports = async () => {
  const artists = await getArtistsForNameIssueScan()
  let flagged = 0

  for (const { artistId, name } of artists) {
    const issue = detectArtistNameIssues(name)
    if (!issue) continue
    await flagArtistNameIssue({ artistId, name, kinds: issue.kinds, suggestedName: issue.suggestedName })
    flagged++
  }

  logger.info(`Artist name issue scan: ${flagged} flagged of ${artists.length} artists`)
  return { success: true, result: { scanned: artists.length, flagged } }
}
