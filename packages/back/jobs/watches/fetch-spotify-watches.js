const { playlistFetchJob, labelFetchJob, artistFetchJob, fetchJobs } = require('./shared/logic')
const { storeUrl } = require('../../routes/stores/spotify/logic')
const { fetchOperation } = require('./shared/fetch-operation')

module.exports = fetchOperation(
  fetchJobs({ artist: artistFetchJob(storeUrl), playlist: playlistFetchJob(storeUrl) })
)
