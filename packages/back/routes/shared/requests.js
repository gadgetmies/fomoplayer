const R = require('ramda')
const BPromise = require('bluebird')
const logger = require('../../logger')(__filename)

// TODO: this returns undefined if the function call throws. Probably not the best design but needed in order
// TODO: to not get an uncaught exception
const safeCall = async (fn, ...args) => {
  try {
    return await fn(...args)
  } catch (e) {
    logger.error(
      `safeCall failed for function: '${fn.name}' with arguments: '${JSON.stringify(args).substring(
        0,
        100
      )}', ${e.toString()}`
    )
  }
}

const processConcurrently = async (arr, fn, bluebirdOptions = { concurrency: 1 }) =>
  await BPromise.map(arr, async item => safeCall(fn, item), bluebirdOptions)

module.exports.processChunks = async (arr, chunkSize, fn, bluebirdOptions = { concurrency: 1 }) => {
  const res = await processConcurrently(R.splitEvery(chunkSize, arr), fn, bluebirdOptions)
  console.log(res)
  return R.flatten(res)
}
