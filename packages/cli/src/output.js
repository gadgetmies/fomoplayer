'use strict'

/**
 * Filters each row object to only include the specified fields.
 * Matching is case-insensitive against the row's own keys.
 *
 * If `fields` is undefined, null, or an empty array, all rows are
 * returned unchanged.
 *
 * @param {object[]} rows
 * @param {string[]|undefined} fields
 * @returns {object[]}
 */
function filterFields(rows, fields) {
  if (!fields || fields.length === 0) {
    return rows
  }

  const normalised = fields.map((f) => f.toLowerCase())

  return rows.map((row) => {
    const result = {}
    for (const key of Object.keys(row)) {
      if (normalised.includes(key.toLowerCase())) {
        result[key] = row[key]
      }
    }
    return result
  })
}

/**
 * Optionally filters rows to the given fields then prints them to stdout
 * as a pretty-printed JSON array.
 *
 * @param {object[]} rows
 * @param {string[]|undefined} fields
 */
function printTable(rows, fields) {
  const filtered = filterFields(rows, fields)
  process.stdout.write(JSON.stringify(filtered, null, 2) + '\n')
}

module.exports = { printTable, filterFields }
