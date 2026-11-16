const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

// A search subscription is a search text: free text, quoted phrases and artist:<id> / label:<id> terms, possibly
// several of them (`artist:12 label:34`). These name its artist, label and release terms after the entity.

const ENTITY_TERM = /^(artist|label|release):(\d+)$/
const termsOf = (text) => text.match(/"[^"]*"|\S+/g) ?? []
const unquote = (term) => term.replace(/^"(.*)"$/, '$1')

// Names for the artist:<id> / label:<id> / release:<id> terms of the given texts, as a Map from the term to the name
const queryEntityTermNames = async (texts) => {
  const ids = { artist: new Set(), label: new Set(), release: new Set() }
  for (const text of texts) {
    for (const term of termsOf(text ?? '')) {
      const match = term.match(ENTITY_TERM)
      if (match) ids[match[1]].add(parseInt(match[2], 10))
    }
  }
  if (ids.artist.size + ids.label.size + ids.release.size === 0) return new Map()
  const rows = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryEntityTermNames
SELECT 'artist:' || artist_id AS term, artist_name AS name
FROM artist
WHERE artist_id = ANY (${[...ids.artist]}::INT[])
UNION ALL
SELECT 'label:' || label_id AS term, label_name AS name
FROM label
WHERE label_id = ANY (${[...ids.label]}::INT[])
UNION ALL
SELECT 'release:' || release_id AS term, release_name AS name
FROM release
WHERE release_id = ANY (${[...ids.release]}::INT[])`,
  )
  return new Map(rows.map(({ term, name }) => [term, name]))
}

// How the Notifications page names a subscription: a single artist or label by its name, a combined search by the names
// of its artists and labels and its text, joined with " · ". Plain text searches keep their text.
const subscriptionDisplayName = (text, names) => {
  const terms = termsOf(text)
  if (!terms.some((term) => ENTITY_TERM.test(term))) return text
  return terms.map((term) => names.get(term) ?? unquote(term)).join(' · ')
}

// How the notification email names a subscription: each artist, label and release as `artist: "<name>"`
const subscriptionEmailText = (text, names) =>
  termsOf(text)
    .map((term) => {
      const name = names.get(term)
      return name ? `${term.match(ENTITY_TERM)[1]}: "${name}"` : term
    })
    .join(' ')

module.exports = { queryEntityTermNames, subscriptionDisplayName, subscriptionEmailText }
