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

function AdminJobs() {
  const history = useHistory()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [launching, setLaunching] = useState(null)

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
              return (
                <tr key={job.name}>
                  <td>{job.name}</td>
                  <td className="muted">{job.schedule || '—'}</td>
                  <td>{job.enabled ? 'Yes' : 'No'}</td>
                  <td className="muted">{formatDateTime(job.lastRun && job.lastRun.started)}</td>
                  <td>
                    <span className={status.className}>{status.label}</span>
                  </td>
                  <td>
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
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default AdminJobs
