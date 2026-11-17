const { pg } = require('fomoplayer_shared').db

// A radiator query's rows are stored in job_run and sent to the admin Radiator view with every run of the past week.
// A query listing rows instead of aggregating them (one row per missing preview, say) grew that to megabytes and froze
// the view, so a query returning more rows than this fails instead of storing them.
const MAX_RESULT_ROWS = 1000

const runRadiatorQuery = async (query, { queryRows = (q) => pg.queryRowsAsync(q), maxRows = MAX_RESULT_ROWS } = {}) => {
  try {
    const rows = await queryRows(query)
    if (rows.length > maxRows) {
      return {
        result: {
          error: `The query returned ${rows.length} rows, more than the ${maxRows} a radiator query may store. Aggregate its results.`,
        },
        success: false,
      }
    }
    return { result: rows, success: true }
  } catch (e) {
    return { result: [e], success: false }
  }
}

module.exports = { runRadiatorQuery, MAX_RESULT_ROWS }
