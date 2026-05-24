import React, { useCallback, useEffect, useState } from 'react'
import { useHistory } from 'react-router-dom'
import { requestJSONwithCredentials } from './request-json-with-credentials'
import { apiURL } from './config'
import './AdminMislabeled.css'

const REASON_LABELS = {
  url_collides_with_label: 'URL is also a label URL',
  url_collides_with_artist: 'URL is also an artist URL',
  name_subdomain_mismatch: 'Name differs from subdomain',
  page_is_label: 'Page is actually a label',
  page_is_artist: 'Page is actually an artist',
  manual: 'Flagged manually',
}

const formatArtists = (artists) => (artists && artists.length ? artists.map((a) => `${a.name} (${a.role})`).join(', ') : '—')

// Group a flat track list (from the inspect endpoint) by release, preserving
// order, so the detail view can offer a per-release bulk reassignment. Tracks
// with no release fall into a trailing group keyed by `null`.
const groupTracksByRelease = (tracks) => {
  const groups = []
  const byReleaseId = new Map()
  tracks.forEach((track) => {
    const key = track.releaseId == null ? null : track.releaseId
    let group = byReleaseId.get(key)
    if (!group) {
      group = { releaseId: track.releaseId ?? null, releaseName: track.releaseName, releaseUrl: track.releaseUrl, tracks: [] }
      byReleaseId.set(key, group)
      groups.push(group)
    }
    group.tracks.push(track)
  })
  return groups
}

// Render text as a link to its Bandcamp page when a URL is known, otherwise the
// bare text — used wherever the view names an artist, label, release or track.
const BandcampLink = ({ url, children }) =>
  url ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <>{children}</>
  )

// Search + pick an entity. With `fixedType` the type selector is hidden and the
// search is locked to that type (used for manual flagging); otherwise the user
// chooses artist/label (used to pick a track's reassignment target).
function EntityPicker({ onPick, processing, fixedType }) {
  const [pickedType, setPickedType] = useState('artist')
  const targetType = fixedType || pickedType
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
      {!fixedType && (
        <select value={pickedType} onChange={(e) => setPickedType(e.target.value)} disabled={processing}>
          <option value="artist">Artist</option>
          <option value="label">Label</option>
        </select>
      )}
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
  const [convertedLabel, setConvertedLabel] = useState(null)
  const [mismatches, setMismatches] = useState([])
  const [fixUrl, setFixUrl] = useState('')

  const fetchMismatches = useCallback(async () => {
    try {
      const rows = await requestJSONwithCredentials({ url: `${apiURL}/admin/bandcamp/artist-name-mismatches` })
      setMismatches(rows)
    } catch (e) {
      console.error(e)
    }
  }, [])

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

  useEffect(() => {
    fetchMismatches()
  }, [fetchMismatches])

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

  const reassignRelease = async (group, { targetType, targetId, targetName }) => {
    if (
      !window.confirm(
        `Reassign all ${group.tracks.length} track${group.tracks.length === 1 ? '' : 's'} of "${
          group.releaseName || group.releaseUrl || 'this release'
        }" from ${type} "${selected.name}" to ${targetType} "${targetName}" (${targetId})?`,
      )
    )
      return
    setProcessing(true)
    try {
      await requestJSONwithCredentials({
        url: `${apiURL}/admin/mislabeled/reassign-release`,
        method: 'POST',
        body: { sourceType: type, sourceId: selected.id, targetType, targetId, releaseId: group.releaseId },
      })
      const reassignedIds = new Set(group.tracks.map((t) => t.id))
      setTracks((prev) => prev.filter((t) => !reassignedIds.has(t.id)))
    } catch (e) {
      console.error(e)
      window.alert('Reassign failed')
    } finally {
      setProcessing(false)
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

  const flagEntity = async ({ targetId, targetName }) => {
    setProcessing(true)
    try {
      await requestJSONwithCredentials({
        url: `${apiURL}/admin/mislabeled/${type}/${targetId}/flag`,
        method: 'POST',
      })
      await fetchEntities(type)
    } catch (e) {
      console.error(e)
      window.alert(`Could not flag "${targetName}"`)
    } finally {
      setProcessing(false)
    }
  }

  const convertToLabel = async () => {
    if (
      !window.confirm(
        `Convert artist "${selected.name}" (${selected.id}) into a label? Every track credited to it will be re-credited to the label, this artist's credit removed, its followers moved to follow the label, and the artist retired.`,
      )
    )
      return
    setProcessing(true)
    try {
      const res = await requestJSONwithCredentials({
        url: `${apiURL}/admin/mislabeled/artist/${selected.id}/convert-to-label`,
        method: 'POST',
      })
      window.alert(
        res.deleted
          ? 'Converted to label; followers moved and the artist retired.'
          : 'Converted to label, but the artist was kept: its followers could not be moved (the label has no Bandcamp store page).',
      )
      setConvertedLabel({ id: res.labelId, name: selected.name })
      await fetchEntities(type)
    } catch (e) {
      console.error(e)
      window.alert('Convert failed')
    } finally {
      setProcessing(false)
    }
  }

  const refetchArtists = async () => {
    setProcessing(true)
    try {
      await requestJSONwithCredentials({
        url: `${apiURL}/admin/labels/${convertedLabel.id}/refetch-bandcamp-artists`,
        method: 'POST',
      })
      window.alert(
        'Queued a background re-fetch of the label’s Bandcamp releases. Track artists will be corrected over the next few minutes.',
      )
      setConvertedLabel(null)
    } catch (e) {
      console.error(e)
      window.alert('Could not queue the artist re-fetch')
    } finally {
      setProcessing(false)
    }
  }

  const fixArtistMismatches = async ({ targetId, targetName }) => {
    setProcessing(true)
    try {
      const res = await requestJSONwithCredentials({
        url: `${apiURL}/admin/artists/${targetId}/fix-bandcamp-mismatches`,
        method: 'POST',
      })
      window.alert(
        res.fixed > 0
          ? `Fixed ${res.fixed} mismatched Bandcamp page(s) held by “${targetName}”. Affected tracks will be re-credited over the next few minutes.`
          : `No mismatched Bandcamp pages found for “${targetName}” (checked ${res.checked}).`,
      )
      await fetchMismatches()
    } catch (e) {
      console.error(e)
      window.alert('Could not fix the artist’s Bandcamp pages')
    } finally {
      setProcessing(false)
    }
  }

  const fixMismatch = async (storeArtistId) => {
    setProcessing(true)
    try {
      const res = await requestJSONwithCredentials({
        url: `${apiURL}/admin/bandcamp/artist-name-mismatches/${storeArtistId}/fix`,
        method: 'POST',
      })
      window.alert(
        res.fixed
          ? `Converted “${res.name}” into a label and queued a re-fetch to re-attribute its tracks to their real artists.`
          : `No change: ${res.reason || 'nothing to fix'}.`,
      )
      await fetchMismatches()
    } catch (e) {
      console.error(e)
      window.alert('Could not fix the mismatch')
    } finally {
      setProcessing(false)
    }
  }

  const ignoreMismatch = async (storeArtistId) => {
    setProcessing(true)
    try {
      await requestJSONwithCredentials({
        url: `${apiURL}/admin/bandcamp/artist-name-mismatches/${storeArtistId}/ignore`,
        method: 'POST',
      })
      await fetchMismatches()
    } catch (e) {
      console.error(e)
      window.alert('Could not ignore the mismatch')
    } finally {
      setProcessing(false)
    }
  }

  const fixByUrl = async () => {
    const url = fixUrl.trim()
    if (!url) return
    setProcessing(true)
    try {
      const res = await requestJSONwithCredentials({
        url: `${apiURL}/admin/bandcamp/fix-artist-page`,
        method: 'POST',
        body: { url },
      })
      window.alert(
        res.fixed
          ? `Converted ${url} (“${res.name}”) into a label and queued a re-fetch to re-attribute its tracks to their real artists.`
          : `No change: ${res.reason || 'nothing to fix'}.`,
      )
      setFixUrl('')
      await fetchMismatches()
    } catch (e) {
      console.error(e)
      window.alert('Could not fix that Bandcamp page')
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
      {convertedLabel && (
        <div className="mislabeled-converted">
          <span>
            Converted “{convertedLabel.name}” to label #{convertedLabel.id}. Re-fetch its Bandcamp releases to
            re-attribute tracks to their real artists?
          </span>
          <button type="button" disabled={processing} onClick={refetchArtists}>
            Re-fetch artists
          </button>
          <button type="button" disabled={processing} onClick={() => setConvertedLabel(null)}>
            Dismiss
          </button>
        </div>
      )}
      <div className="mislabeled-flag">
        <div className="mislabeled-flag-text">
          <span>Flag a {type} as mislabeled:</span>
          <p className="mislabeled-help">
            Adds the chosen {type} to the review list below. This only flags it — its tracks and pages are left
            untouched until you Inspect it and reassign its tracks{' '}
            {type === 'artist' ? '(or Convert it to a label if it is really a label)' : ''}.
          </p>
        </div>
        <EntityPicker fixedType={type} processing={processing} onPick={flagEntity} />
      </div>
      <div className="mislabeled-flag">
        <div className="mislabeled-flag-text">
          <span>Fix an artist that is really a label:</span>
          <p className="mislabeled-help">
            Use this when a Bandcamp page was imported as an artist but is actually a label whose releases are by
            various artists. Converts every matching Bandcamp page held by the chosen artist into a label and queues a
            background re-fetch so each track is re-credited to its real per-track artist (instead of the label name).
          </p>
        </div>
        <EntityPicker fixedType="artist" processing={processing} onPick={fixArtistMismatches} />
      </div>
      <div className="mislabeled-flag">
        <div className="mislabeled-flag-text">
          <span>Fix a Bandcamp page by URL:</span>
          <p className="mislabeled-help">
            The same fix as above, but targeted at one Bandcamp page by its URL. Looks up that page; if it is really a
            label, converts it into a label and queues a re-fetch to re-attribute its tracks to their real artists.
          </p>
          <input
            type="text"
            value={fixUrl}
            placeholder="https://label.bandcamp.com/"
            disabled={processing}
            onChange={(e) => setFixUrl(e.target.value)}
            style={{ minWidth: 280 }}
          />
        </div>
        <button type="button" disabled={processing || !fixUrl.trim()} onClick={fixByUrl}>
          Fix Bandcamp page
        </button>
      </div>
      {mismatches.length > 0 && (
        <div className="mislabeled-mismatches">
          <h6>Suspected wrong artist mappings ({mismatches.length})</h6>
          <p className="mislabeled-help">
            Bandcamp pages imported as artists whose name barely matches their subdomain — usually label pages whose
            releases were collapsed onto a single artist. For each row, “Fix” converts that page into a label and queues
            a re-fetch so its tracks are re-attributed to their real artists; “Ignore” dismisses the suggestion so it
            won’t be flagged again.
          </p>
          {mismatches.map((m) => (
            <div key={m.storeArtistId} className="mislabeled-item">
              <div className="mislabeled-info">
                <div>
                  <strong>
                    <BandcampLink url={m.url}>{m.currentName}</BandcampLink>
                  </strong>{' '}
                  <span className="muted">(artist {m.artistId})</span>
                  <span className="mislabeled-reason">subdomain “{m.subdomain}”</span>
                </div>
                <div className="muted mislabeled-url">
                  <BandcampLink url={m.url}>{m.url || '—'}</BandcampLink>
                </div>
                <div className="muted">similarity {m.similarity}</div>
              </div>
              <div className="mislabeled-actions">
                <button type="button" disabled={processing} onClick={() => fixMismatch(m.storeArtistId)}>
                  Fix
                </button>
                <button type="button" disabled={processing} onClick={() => ignoreMismatch(m.storeArtistId)}>
                  Ignore
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <h6 className="mislabeled-list-heading">Suspected mislabeled {type}s ({entities.length})</h6>
      <p className="mislabeled-help">
        These are the {type}s detected as mislabeled (the reason is shown on each row). “Inspect” opens the {type} and
        lists every track credited to it so you can reassign them to the right artist or label; “Ignore” hides this row
        until it is detected again.
      </p>
      {entities.length === 0 && <div>No suspected mislabeled {type}s found.</div>}
      {entities.map((entity) => (
        <div key={entity.id} className="mislabeled-item">
          <div className="mislabeled-info">
            <div>
              <strong>
                <BandcampLink url={entity.url}>{entity.name}</BandcampLink>
              </strong>{' '}
              <span className="muted">({entity.id})</span>
              <span className="mislabeled-reason">{REASON_LABELS[entity.reason] || entity.reason}</span>
            </div>
            <div className="muted mislabeled-url">
              <BandcampLink url={entity.url}>{entity.url || '—'}</BandcampLink>
            </div>
            <div className="muted">
              {entity.trackCount} track{entity.trackCount === 1 ? '' : 's'}
              {type === 'artist' ? ` · ${entity.releaseCount} release${entity.releaseCount === 1 ? '' : 's'}` : ''}
              {entity.similarity != null ? ` · similarity ${entity.similarity}` : ''}
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

  const renderDetail = () => {
    const groups = groupTracksByRelease(tracks)
    return (
      <div className="mislabeled-detail">
        <div className="mislabeled-detail-header">
          <div>
            <h2>
              {type === 'artist' ? 'Artist' : 'Label'}:{' '}
              <BandcampLink url={selected.url}>{selected.name}</BandcampLink>{' '}
              <span className="muted">({selected.id})</span>
            </h2>
            <div className="muted mislabeled-url">
              <BandcampLink url={selected.url}>{selected.url}</BandcampLink>
            </div>
          </div>
          <div className="mislabeled-actions">
            {type === 'artist' && (
              <button type="button" disabled={processing} onClick={convertToLabel}>
                Convert to label
              </button>
            )}
            <button type="button" disabled={processing} onClick={cleanup}>
              Clean up source
            </button>
            <button type="button" disabled={processing} onClick={() => setSelected(null)}>
              Back to list
            </button>
          </div>
        </div>
        <p className="mislabeled-help">
          Each track below is currently credited to this {type}. Use “Reassign to” on a single track, or “Reassign all
          tracks to” in a release’s header to move a whole release at once, to pick the artist or label it should really
          belong to: the track gains the chosen credit and loses this one. Once no tracks remain, use “Clean up source”
          to clear this {type}’s bogus Bandcamp URL and delete it if it is now empty.
          {type === 'artist'
            ? ' Use “Convert to label” when this is really a label whose releases are by various artists — it turns the artist into a label, moves followers across and queues a re-fetch so each track is re-credited to its real artist.'
            : ''}
        </p>

        {tracksLoading ? (
          <div>Loading tracks…</div>
        ) : tracks.length === 0 ? (
          <div>No tracks remain attributed to this {type}. You can clean up the source now.</div>
        ) : (
          groups.map((group) => (
            <div className="mislabeled-release-group" key={group.releaseId == null ? 'none' : group.releaseId}>
              <div className="mislabeled-release-header">
                <strong>
                  Release: <BandcampLink url={group.releaseUrl}>{group.releaseName || group.releaseUrl || '—'}</BandcampLink>{' '}
                  <span className="muted">
                    ({group.tracks.length} track{group.tracks.length === 1 ? '' : 's'})
                  </span>
                </strong>
                {group.releaseId != null && (
                  <label className="mislabeled-release-reassign">
                    <span>Reassign all tracks to:</span>
                    <EntityPicker
                      fixedType="artist"
                      processing={processing}
                      onPick={(target) => reassignRelease(group, target)}
                    />
                  </label>
                )}
              </div>
              <table className="mislabeled-tracks">
                <thead>
                  <tr>
                    <th>Track</th>
                    <th>Current credits</th>
                    <th>Reassign to</th>
                  </tr>
                </thead>
                <tbody>
                  {group.tracks.map((track) => (
                    <tr key={track.id}>
                      <td>
                        <BandcampLink url={track.trackUrl}>{track.title}</BandcampLink>
                        {track.version ? ` (${track.version})` : ''}
                        {track.role ? <span className="muted"> · {track.role}</span> : null}
                      </td>
                      <td className="muted">{formatArtists(track.artists)}</td>
                      <td>
                        <EntityPicker processing={processing} onPick={(target) => reassign(track, target)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>
    )
  }

  return (
    <div className="page-container scroll-container admin-mislabeled">
      <div className="admin-mislabeled-header">
        <h1>Mislabeled Artists &amp; Labels</h1>
        <div className="mislabeled-actions">
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
