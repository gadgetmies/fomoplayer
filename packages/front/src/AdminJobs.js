import React, { useCallback, useEffect, useState } from 'react'
import { useHistory } from 'react-router-dom'
import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials'
import { apiURL } from './config'
import './AdminJobs.css'

const POLL_INTERVAL_MS = 5000

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '—')

const runStatus = (job) => {
  if (job.running) return { label: 'Running', className: 'admin-jobs-status-running' }
  if (!job.lastRun) return { label: 'Never run', className: 'admin-jobs-status-idle' }
  return job.lastRun.success
    ? { label: 'Success', className: 'admin-jobs-status-success' }
    : { label: 'Failed', className: 'admin-jobs-status-failed' }
}

function JobRuns({ state }) {
  if (!state || state.loading) return <div className="admin-jobs-runs-message">Loading…</div>
  if (state.error) return <div className="admin-jobs-runs-message">Failed to load runs.</div>
  if (!state.runs || state.runs.length === 0) return <div className="admin-jobs-runs-message">No runs recorded.</div>

  return (
    <ul className="admin-jobs-runs">
      {state.runs.map((run) => (
        <li key={run.id} className="admin-jobs-run">
          <div className="admin-jobs-run-meta">
            <span className={run.success ? 'admin-jobs-status-success' : 'admin-jobs-status-failed'}>
              {run.success ? 'Success' : run.ended ? 'Failed' : 'Running'}
            </span>
            <span className="muted">{formatDateTime(run.started)}</span>
            {run.ended && <span className="muted">→ {formatDateTime(run.ended)}</span>}
          </div>
          <pre className="admin-jobs-run-result">
            {run.result === null ? 'No result recorded.' : JSON.stringify(run.result, null, 2)}
          </pre>
        </li>
      ))}
    </ul>
  )
}

function AdminJobs() {
  const history = useHistory()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [launching, setLaunching] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [runsByJob, setRunsByJob] = useState({})

  const fetchJobs = useCallback(async () => {
    try {
      const rows = await requestJSONwithCredentials({ url: `${apiURL}/admin/jobs` })
      setJobs(rows)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchRuns = useCallback(async (name) => {
    setRunsByJob((prev) => ({ ...prev, [name]: { ...prev[name], loading: true, error: false } }))
    try {
      const runs = await requestJSONwithCredentials({ url: `${apiURL}/admin/jobs/${name}/runs` })
      setRunsByJob((prev) => ({ ...prev, [name]: { loading: false, error: false, runs } }))
    } catch (e) {
      console.error(e)
      setRunsByJob((prev) => ({ ...prev, [name]: { loading: false, error: true, runs: [] } }))
    }
  }, [])

  const toggleResult = useCallback(
    (name) => {
      if (expanded === name) {
        setExpanded(null)
        return
      }
      setExpanded(name)
      fetchRuns(name)
    },
    [expanded, fetchRuns],
  )

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchJobs])

  // Kick off the run without blocking the UI on its completion: the request
  // stays open until the job finishes (or the server request times out), but we
  // surface live state through polling instead of awaiting it here.
  const launch = (name) => {
    setLaunching(name)
    requestWithCredentials({ url: `${apiURL}/admin/jobs/${name}/run`, method: 'POST' })
      .catch((e) => console.error(`Run request for job ${name} errored (it may still be running)`, e))
      .finally(() => {
        setLaunching(null)
        fetchJobs()
      })
    setTimeout(fetchJobs, 1000)
  }

  return (
    <div className="page-container scroll-container admin-jobs">
      <div className="admin-jobs-header">
        <h1>Jobs</h1>
        <div className="admin-jobs-header-actions">
          <button className="button button-push_button" onClick={fetchJobs}>
            Refresh
          </button>
          <button className="button button-push_button" onClick={() => history.push('/admin')}>
            Back to Radiator
          </button>
        </div>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : jobs.length === 0 ? (
        <div>No jobs registered.</div>
      ) : (
        <table className="admin-jobs-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Schedule</th>
              <th>Enabled</th>
              <th>Last run</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const status = runStatus(job)
              const busy = job.running || launching === job.name
              const isExpanded = expanded === job.name
              return (
                <React.Fragment key={job.name}>
                  <tr>
                    <td>{job.name}</td>
                    <td className="muted">{job.schedule || '—'}</td>
                    <td>{job.enabled ? 'Yes' : 'No'}</td>
                    <td className="muted">{formatDateTime(job.lastRun && job.lastRun.started)}</td>
                    <td>
                      <span className={status.className}>{status.label}</span>
                    </td>
                    <td className="admin-jobs-actions">
                      <button
                        type="button"
                        className="button button-push_button button-push_button-small"
                        disabled={!job.lastRun}
                        onClick={() => toggleResult(job.name)}
                      >
                        {isExpanded ? 'Hide result' : 'View result'}
                      </button>
                      <button
                        type="button"
                        className="button button-push_button button-push_button-primary button-push_button-small"
                        disabled={busy}
                        onClick={() => launch(job.name)}
                      >
                        {busy ? 'Running…' : 'Run'}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="admin-jobs-result-row">
                      <td colSpan={6}>
                        <JobRuns state={runsByJob[job.name]} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default AdminJobs
