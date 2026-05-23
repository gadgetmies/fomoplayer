import React, { useCallback, useEffect, useState } from 'react'
import { useHistory } from 'react-router-dom'
import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials'
import { apiURL } from './config'
import './AdminMislabeled.css'

const REASON_LABELS = {
  url_collides_with_label: 'URL is also a label URL',
  url_collides_with_artist: 'URL is also an artist URL',
  name_subdomain_mismatch: 'Name differs from subdomain',
  page_is_label: 'Page is actually a label',
  page_is_artist: 'Page is actually an artist',
}

const ANALYSIS_JOB = 'analyseBandcampMislabeled'

const formatArtists = (artists) => (artists && artists.length ? artists.map((a) => `${a.name} (${a.role})`).join(', ') : '—')

// Search + pick a target entity (artist or label) for a single track, then
// hand it back to the parent to perform the reassignment.
function EntityPicker({ onPick, processing }) {
  const [targetType, setTargetType] = useState('artist')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      return undefined
    }
    let active = true
    const timer = setTimeout(async () => {
      try {
        const rows = await requestJSONwithCredentials({
          url: `${apiURL}/entities/search?type=${targetType}&q=${encodeURIComponent(q)}`,
        })
        if (active) {
          setResults(rows)
          setOpen(true)
        }
      } catch (e) {
        console.error(e)
      }
    }, 200)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query, targetType])

  return (
    <div className="mislabeled-picker">
      <select value={targetType} onChange={(e) => setTargetType(e.target.value)} disabled={processing}>
        <option value="artist">Artist</option>
        <option value="label">Label</option>
      </select>
      <div className="mislabeled-search">
        <input
          type="text"
          placeholder={`Search ${targetType}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          disabled={processing}
        />
        {open && results.length > 0 && (
          <ul className="mislabeled-results">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => {
                    setOpen(false)
                    setQuery('')
                    onPick({ targetType, targetId: r.id, targetName: r.name })
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

function AdminMislabeled() {
  const history = useHistory()
  const [type, setType] = useState('artist')
  const [entities, setEntities] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [tracks, setTracks] = useState([])
  const [tracksLoading, setTracksLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [analysing, setAnalysing] = useState(false)

  const fetchEntities = useCallback(async (entityType) => {
    setLoading(true)
    setSelected(null)
    setTracks([])
    try {
      const rows = await requestJSONwithCredentials({ url: `${apiURL}/admin/mislabeled/${entityType}` })
      setEntities(rows)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEntities(type)
  }, [type, fetchEntities])

  const inspect = async (entity) => {
    setSelected(entity)
    setTracksLoading(true)
    setTracks([])
    try {
      const rows = await requestJSONwithCredentials({ url: `${apiURL}/admin/mislabeled/${type}/${entity.id}/tracks` })
      setTracks(rows)
    } catch (e) {
      console.error(e)
    } finally {
      setTracksLoading(false)
    }
  }

  const reassign = async (track, { targetType, targetId, targetName }) => {
    if (
      !window.confirm(
        `Reassign "${track.title}" from ${type} "${selected.name}" to ${targetType} "${targetName}" (${targetId})?`,
      )
    )
      return
    setProcessing(true)
    try {
      await requestJSONwithCredentials({
        url: `${apiURL}/admin/mislabeled/reassign`,
        method: 'POST',
        body: { sourceType: type, sourceId: selected.id, targetType, targetId, trackId: track.id, role: track.role },
      })
      setTracks((prev) => prev.filter((t) => t.id !== track.id))
    } catch (e) {
      console.error(e)
      window.alert('Reassign failed')
    } finally {
      setProcessing(false)
    }
  }

  const runAnalysis = async () => {
    setAnalysing(true)
    try {
      // The job-run endpoint replies with a plain-text acknowledgement, not
      // JSON, so use the non-parsing request helper. The job runs server-side;
      // we just refetch the (now updated) cache afterwards.
      await requestWithCredentials({ url: `${apiURL}/admin/jobs/${ANALYSIS_JOB}/run`, method: 'POST' })
      await fetchEntities(type)
    } catch (e) {
      console.error(e)
      window.alert('Analysis failed')
    } finally {
      setAnalysing(false)
    }
  }

  const ignore = async (entity) => {
    if (!window.confirm(`Ignore "${entity.name}" (${entity.id})? It will be hidden until it is detected again.`)) return
    setProcessing(true)
    try {
      await requestJSONwithCredentials({
        url: `${apiURL}/admin/mislabeled/${type}/${entity.id}/ignore`,
        method: 'POST',
      })
      setEntities((prev) => prev.filter((e) => e.id !== entity.id))
    } catch (e) {
      console.error(e)
      window.alert('Ignore failed')
    } finally {
      setProcessing(false)
    }
  }

  const cleanup = async () => {
    if (
      !window.confirm(
        `Clean up "${selected.name}" (${selected.id})? Clears its bogus Bandcamp URL and deletes the ${type} if it has no tracks or followers left.`,
      )
    )
      return
    setProcessing(true)
    try {
      const res = await requestJSONwithCredentials({
        url: `${apiURL}/admin/mislabeled/${type}/${selected.id}/cleanup`,
        method: 'POST',
      })
      window.alert(res.deleted ? 'Source deleted.' : 'URL cleared; source kept (it still has tracks or followers).')
      await fetchEntities(type)
    } catch (e) {
      console.error(e)
      window.alert('Cleanup failed')
    } finally {
      setProcessing(false)
    }
  }

  const renderList = () => (
    <div className="mislabeled-list">
      {entities.length === 0 && <div>No suspected mislabeled {type}s found.</div>}
      {entities.map((entity) => (
        <div key={entity.id} className="mislabeled-item">
          <div className="mislabeled-info">
            <div>
              <strong>{entity.name}</strong> <span className="muted">({entity.id})</span>
              <span className="mislabeled-reason">{REASON_LABELS[entity.reason] || entity.reason}</span>
            </div>
            <div className="muted mislabeled-url">{entity.url}</div>
            <div className="muted">
              {entity.trackCount} track{entity.trackCount === 1 ? '' : 's'}
              {type === 'artist' ? ` · ${entity.releaseCount} release${entity.releaseCount === 1 ? '' : 's'}` : ''} ·
              similarity {entity.similarity}
            </div>
          </div>
          <div className="mislabeled-actions">
            <button type="button" disabled={processing} onClick={() => inspect(entity)}>
              Inspect
            </button>
            <button type="button" disabled={processing} onClick={() => ignore(entity)}>
              Ignore
            </button>
          </div>
        </div>
      ))}
    </div>
  )

  const renderDetail = () => (
    <div className="mislabeled-detail">
      <div className="mislabeled-detail-header">
        <div>
          <h2>
            {type === 'artist' ? 'Artist' : 'Label'}: {selected.name} <span className="muted">({selected.id})</span>
          </h2>
          <div className="muted mislabeled-url">{selected.url}</div>
        </div>
        <div className="mislabeled-actions">
          <button type="button" disabled={processing} onClick={cleanup}>
            Clean up source
          </button>
          <button type="button" disabled={processing} onClick={() => setSelected(null)}>
            Back to list
          </button>
        </div>
      </div>

      {tracksLoading ? (
        <div>Loading tracks…</div>
      ) : tracks.length === 0 ? (
        <div>No tracks remain attributed to this {type}. You can clean up the source now.</div>
      ) : (
        <table className="mislabeled-tracks">
          <thead>
            <tr>
              <th>Track</th>
              <th>Release</th>
              <th>Current credits</th>
              <th>Reassign to</th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track) => (
              <tr key={track.id}>
                <td>
                  {track.title}
                  {track.version ? ` (${track.version})` : ''}
                  {track.role ? <span className="muted"> · {track.role}</span> : null}
                </td>
                <td>{track.releaseName || '—'}</td>
                <td className="muted">{formatArtists(track.artists)}</td>
                <td>
                  <EntityPicker processing={processing} onPick={(target) => reassign(track, target)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )

  return (
    <div className="page-container scroll-container admin-mislabeled">
      <div className="admin-mislabeled-header">
        <h1>Mislabeled Artists &amp; Labels</h1>
        <div className="mislabeled-actions">
          <button className="button button-push_button" disabled={analysing || processing} onClick={runAnalysis}>
            {analysing ? 'Analysing…' : 'Re-run analysis'}
          </button>
          <button className="button button-push_button" onClick={() => history.push('/admin')}>
            Back to Radiator
          </button>
        </div>
      </div>

      <div className="tabs">
        <button className={type === 'artist' ? 'active' : ''} disabled={processing} onClick={() => setType('artist')}>
          Artists
        </button>
        <button className={type === 'label' ? 'active' : ''} disabled={processing} onClick={() => setType('label')}>
          Labels
        </button>
      </div>

      {loading ? <div>Loading…</div> : selected ? renderDetail() : renderList()}
    </div>
  )
}

export default AdminMislabeled
