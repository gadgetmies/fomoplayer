import React, { useEffect, useState } from 'react'
import { requestJSONwithCredentials } from './request-json-with-credentials'
import { apiURL, isPreviewEnv } from './config'

// Preview-only "danger zone" that wipes and rebuilds the database. Rendered
// only when the client build is a preview AND the server reports the capability
// (the server is authoritative; this is just to avoid showing a dead control).
// Resetting requires typing the exact environment name, then a final confirm.
export default function AdminDatabaseReset() {
  const [capability, setCapability] = useState(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isPreviewEnv) return
    requestJSONwithCredentials({ url: `${apiURL}/admin/capabilities` })
      .then(setCapability)
      .catch((e) => console.error('Failed to load admin capabilities', e))
  }, [])

  if (!isPreviewEnv || !capability || !capability.databaseReset) return null

  const envName = capability.environmentName
  const armed = typed.trim() === envName && !busy

  const reset = async () => {
    if (typed.trim() !== envName) return
    if (
      !window.confirm(
        `This permanently deletes ALL data in "${envName}" and rebuilds an empty database. ` +
          'This cannot be undone. Continue?',
      )
    )
      return
    setBusy(true)
    try {
      await requestJSONwithCredentials({
        url: `${apiURL}/admin/reset-database`,
        method: 'POST',
        body: { confirm: typed.trim() },
      })
      window.alert('Database reset complete. You will likely need to sign in again.')
      window.location.reload()
    } catch (e) {
      console.error(e)
      window.alert('Database reset failed. Check the server logs.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-danger-zone">
      <h2>Danger zone — preview only</h2>
      <p>
        Reset the <strong>{envName}</strong> database: permanently deletes all data and rebuilds an empty schema by
        re-running every migration. Not available in production.
      </p>
      <div className="admin-danger-zone-controls">
        <label htmlFor="admin-db-reset-confirm">
          Type <code>{envName}</code> to enable:
        </label>
        <input
          id="admin-db-reset-confirm"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={envName}
          value={typed}
          disabled={busy}
          onChange={(e) => setTyped(e.target.value)}
        />
        <button className="button button-push_button admin-db-reset-button" disabled={!armed} onClick={reset}>
          {busy ? 'Resetting…' : 'Reset database'}
        </button>
      </div>
    </div>
  )
}
