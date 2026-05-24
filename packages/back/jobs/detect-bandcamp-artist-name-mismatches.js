const logger = require('fomoplayer_shared').logger(__filename)
const {
  static: { nameSubdomainSimilarity, getSubdomain, nameSubdomainSimilarityThreshold },
} = require('../routes/stores/bandcamp/bandcamp-api.js')
const { getBandcampArtistMappings, flagArtistNameMismatch } = require('../routes/stores/bandcamp/db.js')

// Flag Bandcamp artist mappings whose subdomain does not resemble the linked
// artist name (e.g. subdomain "machinedrum" linked to artist "VIER"), which
// means tracks from that page are credited to the wrong artist. Detection only;
// repair is admin-driven so legitimate stage names are not changed blindly.
module.exports = async () => {
  const mappings = await getBandcampArtistMappings()
  let flagged = 0

  for (const { storeArtistId, subdomain, url, name } of mappings) {
    const sub = subdomain || getSubdomain(url)
    if (!sub || !name) continue
    const similarity = nameSubdomainSimilarity(name, sub)
    if (similarity < nameSubdomainSimilarityThreshold) {
      await flagArtistNameMismatch({
        storeArtistId,
        subdomain: sub,
        currentName: name,
        similarity: Number(similarity.toFixed(2)),
      })
      flagged++
    }
  }

  logger.info(`Bandcamp artist name mismatch scan: ${flagged} flagged of ${mappings.length} mappings`)
  return { success: true, result: { scanned: mappings.length, flagged } }
}
