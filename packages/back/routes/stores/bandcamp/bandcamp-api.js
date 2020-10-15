const BPromise = require('bluebird')
const R = require('ramda')
const saferEval = require('safer-eval')
const { error } = require('./logger')

const scrapeJSON = R.curry((startString, stopString, string) => {
  const start = string.indexOf(startString) + startString.length
  const stop = string.indexOf(stopString, start)
  const javascriptString = string.substring(start, stop + stopString.length - 1).replace(/&quot;/g, '"')
  return saferEval(javascriptString)
})

const request = require('request-promise')

const getAlbumInfo = pageSource => scrapeJSON('data-tralbum="', '}"', pageSource)
const getAlbum = (itemUrl, callback) => {
  return request({
    method: 'GET',
    uri: itemUrl
  }).then(res => {
    callback(null, { ...getAlbumInfo(res), url: itemUrl })
  }).catch(e => {
    error(`Fetching album from ${itemUrl} failed`, e)
    callback(e)
  })
}

module.exports = {
  getAlbum,
  getAlbumAsync: BPromise.promisify(getAlbum)
}
