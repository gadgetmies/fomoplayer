const { BadRequest } = require('./httpErrors')
const { queryStoreRegexes } = require('./db/store')
const { modules: storeModules } = require('../stores/index.js')

module.exports.getStoreModuleForArtistByUrl = async artistUrl => {
  const storesRegexes = await queryStoreRegexes()

  let idFromUrl = undefined
  const matchingStore = storesRegexes.find(({ regex: { artist: artistRegex } }) => {
    const urlMatch = artistUrl.match(artistRegex)
    if (urlMatch !== null) {
      // TODO: remove this heresy!
      idFromUrl = urlMatch[1]
    }
    return idFromUrl !== undefined
  })

  if (matchingStore === null) {
    throw new BadRequest(`Invalid artist URL ${artistUrl}`)
  }

  return { module: storeModules[matchingStore.name], idFromUrl }
}

module.exports.getStoreModuleForLabelByUrl = async labelUrl => {
  const storesRegexes = await queryStoreRegexes()

  let idFromUrl = undefined
  const matchingStore = storesRegexes.find(({ regex: { label: labelRegex } }) => {
    const urlMatch = labelUrl.match(labelRegex)
    if (urlMatch !== null) {
      // TODO: remove this heresy!
      idFromUrl = urlMatch[1]
    }
    return idFromUrl !== undefined
  })

  if (matchingStore === null) {
    throw new BadRequest(`Invalid label URL ${labelUrl}`)
  }

  return { module: storeModules[matchingStore.name], idFromUrl }
}

module.exports.getStoreModuleForPlaylistByUrl = async playlistUrl => {
  const storeRegexes = await queryStoreRegexes()
  let matchingStore = undefined
  let matchingRegex = undefined

  for (const store of storeRegexes) {
    matchingRegex = store.regex.playlist.find(({ regex }) => {
      return playlistUrl.match(regex) !== null
    })

    if (matchingRegex !== undefined) {
      matchingStore = store
      break
    }
  }

  if (matchingStore === undefined) {
    throw new BadRequest(`Invalid playlist URL ${playlistUrl}`)
  }

  return { module: storeModules[matchingStore.name], typeId: matchingRegex.typeId }
}
