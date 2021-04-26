const { updateDateAddedScore, updateDateReleasedScore } = require('../../scores')
module.exports.fetchOperation = fn => async job => {
  const result = await fn(job)
  await updateDateReleasedScore()
  await updateDateAddedScore()
  return result
}
