const { queryFollowRegexes } = require('../shared/db/store')

const getStoreDetailsFromUrls = (module.exports.getStoreDetailsFromUrls = async (urlStrings, storeName = undefined) => {
  const regexes = await queryFollowRegexes(storeName)
  return urlStrings.map(url => {
    for (const { storeName, regex, type } of regexes) {
      const match = url.match(new RegExp(regex))
      if (match) {
        const id = match[4]
        return { storeName, id, type, url }
      }
    }
    throw new Error(`URL ${url} did not match any regex`)
  })
})

module.exports.getStoreDetailsFromUrl = async (urlString, storeName = undefined) =>
  getStoreDetailsFromUrls([urlString], storeName)
