const { BadRequest } = require('./httpErrors')

const isMissing = (value) => value === undefined || value === null || value === ''

/**
 * The offset and limit query parameters of a paged track list. A missing value gets its default; anything else must
 * be an integer, the offset 0 or more and the limit from 1 to maxLimit. A limit of 0 is an error: it neither skips
 * the list nor returns every track.
 */
module.exports.parsePage = ({ offset, limit } = {}, { defaultLimit, maxLimit }) => {
  const parsedOffset = isMissing(offset) ? 0 : Number(offset)
  const parsedLimit = isMissing(limit) ? defaultLimit : Number(limit)
  if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
    throw new BadRequest(`offset must be an integer of 0 or more, got: ${offset}`)
  }
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > maxLimit) {
    throw new BadRequest(`limit must be an integer from 1 to ${maxLimit}, got: ${limit}`)
  }
  return { offset: parsedOffset, limit: parsedLimit }
}
