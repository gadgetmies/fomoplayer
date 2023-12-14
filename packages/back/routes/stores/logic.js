const { queryStores } = require('./db.js')
const { queryFollowRegexes } = require('../shared/db/store')

module.exports.getStores = queryStores

const getFollowDetailsFromUrls = (module.exports.getFollowDetailsFromUrls = async (storeName, urlStrings) => {
  const regexes = await queryFollowRegexes(storeName)
  return urlStrings.map(url => {
    for (const { regex, type } of regexes) {
      const match = url.match(regex)
      if (match) {
        const id = match[4]
        return { id, type }
      }
    }
    throw new Error(`URL ${url} did not match any regex`)
  })
})

module.exports.getFollowDetailsFromUrl = async (storeName, urlString) =>
  getFollowDetailsFromUrls(storeName, [urlString])
