const sql = require('sql-template-strings')

const ID_FILTER_KEYS = ['artist', 'label', 'release', 'track']

const parseNotificationText = (text) => {
  const fieldFilters = text.match(/(\S+:\S+)+?/g)?.map((s) => s.split(':')) || []

  const ids = { artist: [], label: [], release: [], track: [] }
  for (const [key, value] of fieldFilters) {
    if (ID_FILTER_KEYS.includes(key) && /^\d+$/.test(value)) {
      ids[key].push(parseInt(value, 10))
    }
  }

  const freeText = text.replace(/(\S+:\S+)\s*/g, '').trim()
  const filteredEntityTypes = new Set()
  for (const k of ID_FILTER_KEYS) {
    if (ids[k].length > 0) filteredEntityTypes.add(k)
  }

  return {
    artistIds: ids.artist,
    labelIds: ids.label,
    releaseIds: ids.release,
    trackIds: ids.track,
    freeText,
    filteredEntityTypes,
  }
}

const idExists = (junctionTable, idColumn, id) => {
  const fragment = sql`EXISTS (SELECT 1 FROM `
  fragment.append(junctionTable)
  fragment.append(sql` WHERE track_id = track.track_id AND `)
  fragment.append(idColumn)
  fragment.append(sql` = ${id})`)
  return fragment
}

const buildNotificationPredicate = (parsed, subscribedStoreIds) => {
  const { artistIds, labelIds, releaseIds, trackIds, freeText, filteredEntityTypes } = parsed

  const conjuncts = []

  for (const id of artistIds) conjuncts.push(idExists('track__artist', 'artist_id', id))
  for (const id of labelIds) conjuncts.push(idExists('track__label', 'label_id', id))
  for (const id of releaseIds) conjuncts.push(idExists('release__track', 'release_id', id))
  for (const id of trackIds) conjuncts.push(sql`track.track_id = ${id}`)

  if (freeText !== '') {
    const textParts = [sql`track.track_title || ' ' || COALESCE(track.track_version, '')`]
    if (!filteredEntityTypes.has('artist')) textParts.push(sql`' ' || COALESCE(artist_agg.artist_text, '')`)
    if (!filteredEntityTypes.has('release')) textParts.push(sql`' ' || COALESCE(release_agg.release_text, '')`)
    if (!filteredEntityTypes.has('label')) textParts.push(sql`' ' || COALESCE(label_agg.label_text, '')`)

    const composite = sql``
    textParts.forEach((part, i) => {
      if (i > 0) composite.append(sql` || `)
      composite.append(part)
    })

    const fts = sql`TO_TSVECTOR('simple', unaccent(`
    fts.append(composite)
    fts.append(sql`)) @@ websearch_to_tsquery('simple', unaccent(${freeText}))`)
    conjuncts.push(fts)
  }

  conjuncts.push(
    sql`EXISTS (SELECT 1 FROM store__track WHERE store__track.track_id = track.track_id AND store_id = ANY(${subscribedStoreIds}))`,
  )

  const out = sql`(`
  conjuncts.forEach((c, i) => {
    if (i > 0) out.append(sql` AND `)
    out.append(c)
  })
  out.append(sql`)`)
  return out
}

module.exports = {
  parseNotificationText,
  buildNotificationPredicate,
}
