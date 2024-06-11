const { BadRequest } = require('./httpErrors')
const { queryStoreRegexes, queryStoreName } = require('./db/store')
const { modules: storeModules } = require('../stores/store-modules')

// TODO: share logic with stores/logic.js
module.exports.getStoreModuleForUrl = async (url) => {
  const storesRegexes = await queryStoreRegexes()
  const matchingStore = storesRegexes
    .map(({ name, regex: regexes }) =>
      Object.entries(regexes).map(([type, regex]) => {
        const urlMatch = url.match(regex)
        return { match: urlMatch !== null, type, name }
      }),
    )
    .flat()
    .find(({ match }) => match)

  if (matchingStore === undefined) {
    throw new BadRequest(`Invalid URL ${url}`)
  }

  return storeModules[matchingStore.name]
}

// TODO: share logic with stores/logic.js
module.exports.getStoreModuleForArtistByUrl = async (artistUrl) => {
  const storesRegexes = await queryStoreRegexes()
  const matchingStore = storesRegexes.find(({ regex: { artist: artistRegex } }) => {
    const urlMatch = artistUrl.match(artistRegex)
    return urlMatch !== null
  })

  if (matchingStore === undefined) {
    throw new BadRequest(`Invalid artist URL ${artistUrl}`)
  }

  return storeModules[matchingStore.name]
}

// TODO: share logic with stores/logic.js
module.exports.getStoreModuleForLabelByUrl = async (labelUrl) => {
  const storesRegexes = await queryStoreRegexes()

  const matchingStore = storesRegexes.find(({ regex: { label: labelRegex } }) => {
    const urlMatch = labelUrl.match(labelRegex)
    return urlMatch !== null
  })

  if (matchingStore === undefined) {
    throw new BadRequest(`Invalid label URL ${labelUrl}`)
  }

  return storeModules[matchingStore.name]
}

// TODO: share logic with stores/logic.js
module.exports.getStoreModuleForPlaylistByUrl = async (playlistUrl) => {
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

// TODO: share logic with stores/logic.js
module.exports.getStoreModuleForStoreId = async (storeId) => {
  const storeName = await queryStoreName(storeId)
  return storeModules[storeName]
}
