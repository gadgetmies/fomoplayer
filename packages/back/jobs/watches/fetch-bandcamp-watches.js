const { playlistFetchJob, labelFetchJob, artistFetchJob, fetchJobs } = require('./shared/logic')
const { storeUrl } = require('../../routes/stores/bandcamp/logic')
const { fetchOperation } = require('./shared/fetch-operation')

module.exports = (options = {}) =>
  fetchOperation(
    fetchJobs({
      artist: artistFetchJob(storeUrl, options),
      label: labelFetchJob(storeUrl, options),
      playlist: playlistFetchJob(storeUrl, options),
    }),
  )
