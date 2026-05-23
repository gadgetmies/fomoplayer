#!/usr/bin/env node

/**
 * Fetches the Beatport genre catalog from the v4 API and prints:
 *   1. a diff against the in-code cache (routes/stores/beatport/genres.js), and
 *   2. a ready-to-paste GENRES array.
 *
 * The catalog is cached in code because it changes rarely; run this whenever the
 * checkBeatportGenres job reports drift (or to seed Open Format genres) and paste
 * the printed block into genres.js.
 *
 * Requires Beatport credentials in the environment:
 *   BEATPORT_USERNAME=... BEATPORT_PASSWORD=... node scripts/fetch-beatport-genres.js
 */
const bpApi = require('../routes/stores/beatport/bp-api')
const { genres: cachedGenres } = require('../routes/stores/beatport/genres')

const normalize = (genre) => ({ id: genre.id, name: genre.name, slug: genre.slug })

const formatRow = ({ id, name, slug }) =>
  `  { id: ${id}, name: '${String(name).replace(/'/g, "\\'")}', slug: '${slug}' },`

const main = async () => {
  const live = (await bpApi.getGenres())
    .filter((genre) => genre.enabled !== false)
    .map(normalize)
    .sort((a, b) => a.id - b.id)

  if (live.length === 0) {
    console.error('No genres returned by the Beatport API.')
    process.exit(1)
  }

  const cachedById = new Map(cachedGenres.map((genre) => [genre.id, genre]))
  const liveById = new Map(live.map((genre) => [genre.id, genre]))

  const added = live.filter((genre) => !cachedById.has(genre.id))
  const removed = cachedGenres.filter((genre) => !liveById.has(genre.id))
  const renamed = live.filter((genre) => {
    const cached = cachedById.get(genre.id)
    return cached && (cached.name !== genre.name || cached.slug !== genre.slug)
  })

  const describe = (genre) => `${genre.id} ${genre.name} (${genre.slug})`
  console.error(`Fetched ${live.length} genres; cache has ${cachedGenres.length}.`)
  console.error(`  added:   ${added.length ? added.map(describe).join(', ') : 'none'}`)
  console.error(`  removed: ${removed.length ? removed.map(describe).join(', ') : 'none'}`)
  console.error(
    `  renamed: ${
      renamed.length
        ? renamed
            .map(
              (genre) => `${describe(genre)} [was ${cachedById.get(genre.id).name} / ${cachedById.get(genre.id).slug}]`,
            )
            .join(', ')
        : 'none'
    }`,
  )
  console.error('\nPaste the block below into routes/stores/beatport/genres.js:\n')

  console.log('const GENRES = [')
  console.log(live.map(formatRow).join('\n'))
  console.log(']')
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
