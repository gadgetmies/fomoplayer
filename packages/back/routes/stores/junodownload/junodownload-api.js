const BPromise = require('bluebird')
const { error } = require('../../../logger')(__filename)
const axios = require('axios')

/*
const scrapeText = R.curry((pattern, string) => {
  const match = string.match(new RegExp(pattern), 's')
  if (match === null) {
    console.log(string)
    throw new Error('No match for pattern')
  }
  return match[1]
})

const getImageForResult = async url => {
  const { data } = await axios.get(url)
  return scrapeText('<meta property="og:image" content="(.*)"', data)
}
 */

const getDetailsForResult = async ({ label, category, url: id }) => {
  const type = category === 'Artists' ? 'artist' : 'label'
  let url = `https://www.junodownload.com/${type}s/${id}/`
  return {
    type,
    url,
    id,
    name: label,
    img: 'https://wwwcdn.junodownload.com/12130102/images/digital/facebook_jd.png' // TODO: Only labels have images and no-one probably needs to see those // await getImageForResult(url)
  }
}

const mapSearchResults = async results =>
  BPromise.map(
    results.filter(({ category }) => !['Artist', 'Label'].includes(category)),
    getDetailsForResult,
    { concurrency: 2 }
  )

const getSearchResults = async (query, callback) => {
  try {
    const res = await axios.get(
      `https://www.junodownload.com/noauto/autocomplete.php?type=q[all][]&term=${query.split(' ').join('+')}`
    )
    const mapped = await mapSearchResults(res.data)
    callback(null, mapped)
  } catch (e) {
    error(`Searching for ${query} failed`, e)
    callback(e)
  }
}

module.exports = BPromise.promisifyAll({
  getRelease: () => {},
  getArtist: () => {},
  getLabel: () => {},
  getTag: () => {},
  getTagReleases: () => {},
  getPageDetails: () => {},
  getSearchResults
})

