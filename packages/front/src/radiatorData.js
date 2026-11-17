// Helpers for the admin Radiator view. A week of radiator job runs can hold a lot of rows, so the view summarises the
// data instead of putting all of it into a text box, and shows at most a limited number of items of the lens output.

const rowCount = (result) => (Array.isArray(result) ? result.length : null)

// One summary per radiator job: how many runs the past week holds and what the latest run returned.
export const summariseRadiatorData = (data) =>
  (Array.isArray(data) ? data : []).map(({ job_name, results = [] }) => {
    const latest = results[0]
    return {
      job: job_name,
      runs: results.length,
      latestStarted: latest ? latest.started : null,
      latestSuccess: latest ? latest.success : null,
      latestRows: latest ? rowCount(latest.result) : null,
      latestError: latest && !latest.success && latest.result && latest.result.error ? latest.result.error : null,
    }
  })

// JSON for a read-only text box, limited to the first `limit` items of an array.
export const previewJSON = (value, limit = 200) => {
  if (Array.isArray(value) && value.length > limit) {
    return `${JSON.stringify(value.slice(0, limit), null, 2)}\n\n… showing ${limit} of ${value.length} items`
  }
  return JSON.stringify(value, null, 2)
}
