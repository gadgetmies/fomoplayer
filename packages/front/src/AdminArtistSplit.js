import React, { useCallback, useEffect, useState } from 'react'
import { useHistory } from 'react-router-dom'
import { requestJSONwithCredentials } from './request-json-with-credentials'
import { apiURL } from './config'
import './AdminArtistSplit.css'

const BandcampLink = ({ url, children }) =>
  url ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <>{children}</>
  )

const formatCredit = (credit) => `${credit.name} (${credit.role})`

// A single artist input: type a name to create a new artist, or pick an
// existing one from the autocomplete. `value` is { name } for a new artist or
// { artistId, name } for an existing one; the badge shows which.
function ArtistField({ value, onChange, processing, placeholder }) {
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
    <div className="artist-field">
      <span className={`artist-field-badge ${value && value.artistId ? 'existing' : 'new'}`}>
        {value && value.artistId ? `#${value.artistId}` : 'new'}
      </span>
      <div className="artist-field-search">
        <input
          type="text"
          placeholder={placeholder || 'Artist name…'}
          value={name}
          disabled={processing}
          onChange={(e) => {
            onChange({ name: e.target.value })
            setOpen(true)
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && results.length > 0 && (
          <ul className="artist-field-results">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={processing}
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

function AdminArtistSplit() {
  const history = useHistory()
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [selected, setSelected] = useState(null)
  const [tracks, setTracks] = useState([])
  const [tracksLoading, setTracksLoading] = useState(false)
  const [targets, setTargets] = useState([])
  const [addState, setAddState] = useState({})
  const [manualArtist, setManualArtist] = useState({ name: '' })

  const fetchCandidates = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await requestJSONwithCredentials({ url: `${apiURL}/admin/artist-split-candidates` })
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

  const loadTracks = useCallback(async (artistId) => {
    setTracksLoading(true)
    try {
      const rows = await requestJSONwithCredentials({ url: `${apiURL}/admin/artists/${artistId}/tracks` })
      setTracks(rows)
    } catch (e) {
      console.error(e)
    } finally {
      setTracksLoading(false)
    }
  }, [])

  const inspect = async (artist, suggestions) => {
    setSelected(artist)
    setAddState({})
    const initialTargets =
      suggestions && suggestions.length >= 2 ? suggestions.map((name) => ({ name })) : [{ name: '' }, { name: '' }]
    setTargets(initialTargets)
    setTracks([])
    await loadTracks(artist.id)
  }

  const inspectManual = async () => {
    if (!manualArtist.artistId) return
    await inspect({ id: manualArtist.artistId, name: manualArtist.name }, null)
    setManualArtist({ name: '' })
  }

  const ignore = async (artist) => {
    if (!window.confirm(`Ignore "${artist.name}" (${artist.id})? It will be hidden until it is detected again.`)) return
    setProcessing(true)
    try {
      await requestJSONwithCredentials({
        url: `${apiURL}/admin/artist-split-candidates/${artist.id}/ignore`,
        method: 'POST',
      })
      setCandidates((prev) => prev.filter((c) => c.id !== artist.id))
    } catch (e) {
      console.error(e)
      window.alert('Ignore failed')
    } finally {
      setProcessing(false)
    }
  }

  const updateTarget = (index, value) => setTargets((prev) => prev.map((t, i) => (i === index ? value : t)))
  const addTargetRow = () => setTargets((prev) => [...prev, { name: '' }])
  const removeTargetRow = (index) => setTargets((prev) => prev.filter((_, i) => i !== index))

  const validTargets = targets
    .map((t) => (t.artistId ? { artistId: t.artistId, name: t.name } : { name: (t.name || '').trim() }))
    .filter((t) => t.artistId || t.name)

  const doSplit = async () => {
    if (validTargets.length < 2) {
      window.alert('Add at least two artists to split into.')
      return
    }
    const summary = validTargets.map((t) => (t.artistId ? `${t.name} (#${t.artistId})` : `${t.name} (new)`)).join(', ')
    if (
      !window.confirm(
        `Split "${selected.name}" (${selected.id}) into: ${summary}?\n\nEvery track credited to "${selected.name}" will be re-credited to each of these artists, and the combined artist retired.`,
      )
    )
      return
    setProcessing(true)
    try {
      const res = await requestJSONwithCredentials({
        url: `${apiURL}/admin/artists/${selected.id}/split`,
        method: 'POST',
        body: { targets: validTargets.map((t) => (t.artistId ? { artistId: t.artistId } : { name: t.name })) },
      })
      window.alert(
        `Re-credited ${res.trackCount} track${res.trackCount === 1 ? '' : 's'} to ${res.targetArtistIds.length} artists` +
          (res.followerCount ? `, moved ${res.followerCount} follower${res.followerCount === 1 ? '' : 's'} to the new artists` : '') +
          '.' +
          (res.deleted
            ? ' The combined artist was retired.'
            : ' The combined artist was kept (its followers could not be moved to any target with a store page).'),
      )
      setCandidates((prev) => prev.filter((c) => c.id !== selected.id))
      setSelected(null)
    } catch (e) {
      console.error(e)
      window.alert('Split failed')
    } finally {
      setProcessing(false)
    }
  }

  const getAdd = (trackId) => addState[trackId] || { target: { name: '' }, role: 'author' }
  const setAdd = (trackId, next) => setAddState((prev) => ({ ...prev, [trackId]: next }))

  const addCredit = async (track) => {
    const { target, role } = getAdd(track.id)
    const body = target.artistId ? { artistId: target.artistId, role } : { name: (target.name || '').trim(), role }
    if (!body.artistId && !body.name) {
      window.alert('Pick an existing artist or type a name to add.')
      return
    }
    setProcessing(true)
    try {
      await requestJSONwithCredentials({
        url: `${apiURL}/admin/tracks/${track.id}/credits/add`,
        method: 'POST',
        body,
      })
      setAdd(track.id, { target: { name: '' }, role: 'author' })
      await loadTracks(selected.id)
    } catch (e) {
      console.error(e)
      window.alert('Could not add the credit')
    } finally {
      setProcessing(false)
    }
  }

  const removeCredit = async (track, credit) => {
    if (!window.confirm(`Remove ${formatCredit(credit)} from "${track.title}"?`)) return
    setProcessing(true)
    try {
      await requestJSONwithCredentials({
        url: `${apiURL}/admin/tracks/${track.id}/credits/remove`,
        method: 'POST',
        body: { artistId: credit.artistId, role: credit.role },
      })
      await loadTracks(selected.id)
    } catch (e) {
      console.error(e)
      window.alert('Could not remove the credit')
    } finally {
      setProcessing(false)
    }
  }

  const renderList = () => (
    <div className="split-list">
      <div className="split-manual">
        <span>Inspect / split any artist:</span>
        <ArtistField value={manualArtist} onChange={setManualArtist} processing={processing} />
        <button type="button" disabled={processing || !manualArtist.artistId} onClick={inspectManual}>
          Inspect
        </button>
      </div>
      {candidates.length === 0 && <div>No suspected combined artists found.</div>}
      {candidates.map((candidate) => (
        <div key={candidate.id} className="split-item">
          <div className="split-info">
            <div>
              <strong>{candidate.name}</strong> <span className="muted">({candidate.id})</span>
            </div>
            {candidate.detectedName && candidate.detectedName !== candidate.name && (
              <div className="muted">detected as “{candidate.detectedName}”</div>
            )}
            <div className="split-suggestions">
              {(candidate.suggestions || []).map((s, i) => (
                <span key={i} className="split-chip">
                  {s}
                </span>
              ))}
            </div>
            <div className="muted">
              {candidate.trackCount} track{candidate.trackCount === 1 ? '' : 's'}
            </div>
          </div>
          <div className="split-actions">
            <button type="button" disabled={processing} onClick={() => inspect(candidate, candidate.suggestions)}>
              Inspect
            </button>
            <button type="button" disabled={processing} onClick={() => ignore(candidate)}>
              Ignore
            </button>
          </div>
        </div>
      ))}
    </div>
  )

  const renderDetail = () => (
    <div className="split-detail">
      <div className="split-detail-header">
        <h2>
          {selected.name} <span className="muted">({selected.id})</span>
        </h2>
        <button type="button" disabled={processing} onClick={() => setSelected(null)}>
          Back to list
        </button>
      </div>

      <div className="split-panel">
        <h3>Split into separate artists</h3>
        <p className="muted">
          Each track credited to this artist will be re-credited to all of the artists below, its followers moved to
          them, and the combined artist then retired. Pick existing artists or type a name to create a new one.
        </p>
        {targets.map((target, index) => (
          <div key={index} className="split-target-row">
            <ArtistField
              value={target}
              processing={processing}
              onChange={(value) => updateTarget(index, value)}
              placeholder="Artist name…"
            />
            <button
              type="button"
              className="split-target-remove"
              disabled={processing || targets.length <= 1}
              onClick={() => removeTargetRow(index)}
            >
              ✕
            </button>
          </div>
        ))}
        <div className="split-panel-actions">
          <button type="button" disabled={processing} onClick={addTargetRow}>
            Add artist
          </button>
          <button
            type="button"
            className="split-primary"
            disabled={processing || validTargets.length < 2}
            onClick={doSplit}
          >
            Split into {validTargets.length || 0} artists
          </button>
        </div>
      </div>

      <h3>Tracks &amp; credits</h3>
      {tracksLoading ? (
        <div>Loading tracks…</div>
      ) : tracks.length === 0 ? (
        <div>No tracks are credited to this artist.</div>
      ) : (
        <table className="split-tracks">
          <thead>
            <tr>
              <th>Track</th>
              <th>Release</th>
              <th>Credits</th>
              <th>Add credit</th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track) => {
              const add = getAdd(track.id)
              return (
                <tr key={track.id}>
                  <td>
                    <BandcampLink url={track.trackUrl}>{track.title}</BandcampLink>
                    {track.version ? ` (${track.version})` : ''}
                  </td>
                  <td>
                    <BandcampLink url={track.releaseUrl}>{track.releaseName || track.releaseUrl || '—'}</BandcampLink>
                  </td>
                  <td>
                    <div className="split-credits">
                      {(track.credits || []).map((credit) => (
                        <span key={`${credit.artistId}-${credit.role}`} className="split-credit">
                          {credit.name} <span className="muted">({credit.role})</span>
                          <button
                            type="button"
                            className="split-credit-remove"
                            disabled={processing}
                            title="Remove credit"
                            onClick={() => removeCredit(track, credit)}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="split-add-credit">
                      <ArtistField
                        value={add.target}
                        processing={processing}
                        onChange={(value) => setAdd(track.id, { ...add, target: value })}
                      />
                      <select
                        value={add.role}
                        disabled={processing}
                        onChange={(e) => setAdd(track.id, { ...add, role: e.target.value })}
                      >
                        <option value="author">author</option>
                        <option value="remixer">remixer</option>
                      </select>
                      <button type="button" disabled={processing} onClick={() => addCredit(track)}>
                        Add
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )

  return (
    <div className="page-container scroll-container admin-artist-split">
      <div className="admin-artist-split-header">
        <h1>Split Combined Artists</h1>
        <button className="button button-push_button" onClick={() => history.push('/admin')}>
          Back to Radiator
        </button>
      </div>
      {loading ? <div>Loading…</div> : selected ? renderDetail() : renderList()}
    </div>
  )
}

export default AdminArtistSplit
