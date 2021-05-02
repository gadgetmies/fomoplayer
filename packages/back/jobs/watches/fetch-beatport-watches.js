const { playlistFetchJob, labelFetchJob, artistFetchJob, fetchJobs } = require('./shared/logic')
const { storeUrl } = require('../../routes/stores/beatport/logic')
const { fetchOperation } = require('./shared/fetch-operation')

module.exports = fetchOperation(
  fetchJobs({ artist: artistFetchJob(storeUrl), label: labelFetchJob(storeUrl), playlist: playlistFetchJob(storeUrl) })
)
