import React, { useCallback, useEffect, useState } from 'react'
import { useHistory } from 'react-router-dom'
import { requestJSONwithCredentials } from './request-json-with-credentials'
import { apiURL } from './config'
import './AdminArtistNames.css'

// artist.artist_name VARCHAR(100); the backend rejects longer rename
// inputs too, but failing fast in the UI saves a round trip.
const NAME_MAX = 100

const KIND_LABELS = {
  feat: 'feat./ft.',
  versionTag: 'Remix/version tag',
  parenthetical: 'Parenthetical',
  whitespace: 'Whitespace/punct.',
}

// A single artist autocomplete: type to search existing artists and pick
// one from the dropdown. `value` is { artistId, name } or { name: '' }.
// Compact variant used inline per row for the merge target — does not
// support creating a new artist (merge requires an existing target).
function ArtistSearchField({ value, onChange, disabled, placeholder }) {
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const name = (value && value.name) || ''

  useEffect(() => {
    const q = name.trim()
    if (!q) {
      setResults([])
      return undefined
    }
    let active = true
    const timer = setTimeout(async () => {
      try {
        const rows = await requestJSONwithCredentials({
          url: `${apiURL}/entities/search?type=artist&q=${encodeURIComponent(q)}`,
        })
        if (active) setResults(rows)
      } catch (e) {
        console.error(e)
      }
    }, 200)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [name])

  return (
    <div className="artist-names-search">
      <span className={`artist-names-search-badge ${value && value.artistId ? 'existing' : 'empty'}`}>
        {value && value.artistId ? `#${value.artistId}` : '—'}
      </span>
      <div className="artist-names-search-input">
        <input
          type="text"
          placeholder={placeholder || 'Search artist…'}
          value={name}
          disabled={disabled}
          onChange={(e) => {
            // Typing a new query clears the pinned artistId so the admin
            // cannot accidentally merge into a stale prior selection.
            onChange({ name: e.target.value })
            setOpen(true)
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && results.length > 0 && (
          <ul className="artist-names-search-results">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onChange({ artistId: r.id, name: r.name })
                    setOpen(false)
                  }}
                >
                  {r.name} <span className="muted">({r.id})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// Per-candidate row: a rename input (prefilled with the suggested cleaned
// name when one was detected), a merge-into search, a delete button, and
// an ignore button. Each action is independent — the admin picks one and
// fires it. Local state for the rename input and merge target lives on
// the row so concurrent edits to different rows do not interfere.
function CandidateRow({ candidate, processing, onChange, onAction }) {
  const [renameValue, setRenameValue] = useState(candidate.suggestedName || candidate.name)
  const [mergeTarget, setMergeTarget] = useState({ name: '' })
  const [showTracks, setShowTracks] = useState(false)
  const [tracks, setTracks] = useState(null)
  const [tracksLoading, setTracksLoading] = useState(false)

  const loadTracks = useCallback(async () => {
    setTracksLoading(true)
    try {
      const rows = await requestJSONwithCredentials({
        url: `${apiURL}/admin/artists/${candidate.id}/tracks`,
      })
      setTracks(rows)
    } catch (e) {
      console.error(e)
    } finally {
      setTracksLoading(false)
    }
  }, [candidate.id])

  const toggleTracks = async () => {
    if (!showTracks && tracks === null) await loadTracks()
    setShowTracks(!showTracks)
  }

  const doRename = async () => {
    const trimmed = renameValue.trim()
    if (!trimmed) {
      window.alert('Type a name to rename to.')
      return
    }
    if (trimmed === candidate.name) {
      window.alert('The new name is the same as the current one.')
      return
    }
    if (!window.confirm(`Rename "${candidate.name}" (${candidate.id}) to "${trimmed}"?`)) return
    onAction(async () => {
      const res = await requestJSONwithCredentials({
        url: `${apiURL}/admin/artists/${candidate.id}/rename`,
        method: 'POST',
        body: { name: trimmed },
      })
      window.alert(
        res.changed
          ? `Renamed to "${res.name}" and refreshed ${res.trackCount} track${res.trackCount === 1 ? '' : 's'}.`
          : `No change — name was already "${res.name}".`,
      )
      onChange()
    })
  }

  const doMerge = async () => {
    if (!mergeTarget.artistId) {
      window.alert('Pick the artist to merge into from the search.')
      return
    }
    if (mergeTarget.artistId === candidate.id) {
      window.alert('Cannot merge an artist into itself.')
      return
    }
    if (
      !window.confirm(
        `Merge "${candidate.name}" (${candidate.id}) into "${mergeTarget.name}" (${mergeTarget.artistId})?\n\n` +
          `Every track, store mapping, genre and ignore on "${candidate.name}" will move to "${mergeTarget.name}", ` +
          `and "${candidate.name}" will be deleted.`,
      )
    )
      return
    onAction(async () => {
      const res = await requestJSONwithCredentials({
        url: `${apiURL}/admin/artists/${candidate.id}/merge-into/${mergeTarget.artistId}`,
        method: 'POST',
      })
      window.alert(`Merged. ${res.trackCount} track${res.trackCount === 1 ? '' : 's'} refreshed.`)
      onChange()
    })
  }

  const doDelete = async () => {
    if (
      !window.confirm(
        `Delete artist "${candidate.name}" (${candidate.id}) entirely?\n\n` +
          `Its ${candidate.trackCount} track credit${candidate.trackCount === 1 ? '' : 's'}, store mappings, genres and ignores will be removed. ` +
          `This cannot be undone. (If the artist has followers the server will refuse — merge into a real artist first.)`,
      )
    )
      return
    onAction(async () => {
      const res = await requestJSONwithCredentials({
        url: `${apiURL}/admin/artists/${candidate.id}/delete`,
        method: 'POST',
      })
      window.alert(`Deleted. ${res.trackCount} track credit${res.trackCount === 1 ? '' : 's'} removed.`)
      onChange()
    })
  }

  const doIgnore = async () => {
    if (
      !window.confirm(
        `Ignore "${candidate.name}" (${candidate.id})? It will be hidden until manually un-ignored in the database.`,
      )
    )
      return
    onAction(async () => {
      await requestJSONwithCredentials({
        url: `${apiURL}/admin/artist-name-issues/${candidate.id}/ignore`,
        method: 'POST',
      })
      onChange()
    })
  }

  return (
    <div className="artist-names-item">
      <div className="artist-names-info">
        <div className="artist-names-headline">
          <strong>{candidate.name}</strong> <span className="muted">({candidate.id})</span>
        </div>
        <div className="artist-names-chips">
          {(candidate.kinds || []).map((kind) => (
            <span key={kind} className="artist-names-chip">
              {KIND_LABELS[kind] || kind}
            </span>
          ))}
        </div>
        <div className="muted">
          {candidate.trackCount} track{candidate.trackCount === 1 ? '' : 's'}
          {' · '}
          <button type="button" className="artist-names-link" onClick={toggleTracks} disabled={processing}>
            {showTracks ? 'hide tracks' : 'inspect tracks'}
          </button>
        </div>
      </div>
      <div className="artist-names-actions">
        <div className="artist-names-action-row">
          <input
            type="text"
            value={renameValue}
            disabled={processing}
            maxLength={NAME_MAX}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Cleaned name…"
          />
          <button type="button" disabled={processing} onClick={doRename}>
            Rename
          </button>
        </div>
        <div className="artist-names-action-row">
          <ArtistSearchField
            value={mergeTarget}
            onChange={setMergeTarget}
            disabled={processing}
            placeholder="Merge into…"
          />
          <button type="button" disabled={processing || !mergeTarget.artistId} onClick={doMerge}>
            Merge
          </button>
        </div>
        <div className="artist-names-action-row">
          <button type="button" className="artist-names-danger" disabled={processing} onClick={doDelete}>
            Delete
          </button>
          <button type="button" disabled={processing} onClick={doIgnore}>
            Ignore
          </button>
        </div>
      </div>
      {showTracks && (
        <div className="artist-names-tracks">
          {tracksLoading ? (
            <div className="muted">Loading tracks…</div>
          ) : tracks && tracks.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Track</th>
                  <th>Release</th>
                  <th>Credits</th>
                </tr>
              </thead>
              <tbody>
                {tracks.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.trackUrl ? (
                        <a href={t.trackUrl} target="_blank" rel="noopener noreferrer">
                          {t.title}
                        </a>
                      ) : (
                        t.title
                      )}
                      {t.version ? ` (${t.version})` : ''}
                    </td>
                    <td>
                      {t.releaseUrl ? (
                        <a href={t.releaseUrl} target="_blank" rel="noopener noreferrer">
                          {t.releaseName || t.releaseUrl}
                        </a>
                      ) : (
                        t.releaseName || '—'
                      )}
                    </td>
                    <td>
                      {(t.credits || [])
                        .map((c) => `${c.name} (${c.role})`)
                        .join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="muted">No tracks credited to this artist.</div>
          )}
        </div>
      )}
    </div>
  )
}

function AdminArtistNames() {
  const history = useHistory()
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  const fetchCandidates = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await requestJSONwithCredentials({ url: `${apiURL}/admin/artist-name-issues` })
      setCandidates(rows)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCandidates()
  }, [fetchCandidates])

  // Action runner shared by every per-row button: serialises requests so
  // two clicks cannot race and produces a single processing flag that
  // disables every input on the page until the in-flight action resolves.
  const runAction = useCallback(
    async (fn) => {
      setProcessing(true)
      try {
        await fn()
      } catch (e) {
        console.error(e)
        const message = (e && e.responseText) || (e && e.message) || 'Action failed'
        window.alert(message)
      } finally {
        setProcessing(false)
      }
    },
    [],
  )

  return (
    <div className="page-container scroll-container admin-artist-names">
      <div className="admin-artist-names-header">
        <h1>Fix Artist Names</h1>
        <button className="button button-push_button" onClick={() => history.push('/admin')}>
          Back to Radiator
        </button>
      </div>
      <p className="muted">
        Artists whose name looks polluted by track-title or version metadata at import time. Pick an action per row:
        rename to strip the junk, merge into the real artist, or delete a bogus record. Ignore hides a row until it is
        manually un-ignored in the database.
      </p>
      {loading ? (
        <div>Loading…</div>
      ) : candidates.length === 0 ? (
        <div>No flagged artists. Run the <code>detectArtistNameIssues</code> job to refresh the list.</div>
      ) : (
        <div className="artist-names-list">
          {candidates.map((candidate) => (
            <CandidateRow
              key={candidate.id}
              candidate={candidate}
              processing={processing}
              onChange={fetchCandidates}
              onAction={runAction}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default AdminArtistNames
