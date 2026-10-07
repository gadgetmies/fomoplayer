import React, { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import './CartSearchControls.css'

// Group colours: warm tones that sit with the grey UI and stay clear of the brand purple and the blue used for the
// playing row and active toggles.
export const GROUP_COLORS = ['#f2a93b', '#7cc66a', '#ef6f57', '#e6d36a', '#c98a5b', '#d8a07a', '#a8c97a', '#e89a7a']
export const groupColor = (group) => GROUP_COLORS[group % GROUP_COLORS.length]

export const GroupDot = ({ group, size = 9 }) => (
  <span className="cart-search-dot" style={{ background: groupColor(group), width: size, height: size }} />
)

const shortName = (name) => (name || '').split(', ').slice(0, 2).join(', ')

const CartSearchMap = ({ result, tracks, chip, highlightedTrackId, onPointClick }) => {
  const W = 300
  const H = 190
  const P = 10
  const sx = (x) => P + x * (W - 2 * P)
  const sy = (y) => P + (1 - y) * (H - 2 * P)
  const dim = (group) => (chip !== 'all' && group !== chip ? 0.18 : 1)
  return (
    <div className="cart-search-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Map of the cart's tracks and the results">
        {result.map.members.map(({ trackId, group, x, y }) => (
          <circle
            key={`m${trackId}`}
            cx={sx(x)}
            cy={sy(y)}
            r={3.5}
            fill={groupColor(group)}
            opacity={0.9 * dim(group)}
          />
        ))}
        {tracks.map(({ id, title, cartSearch }) => (
          <circle
            key={`r${id}`}
            data-testid="cart-search-map-result"
            cx={sx(cartSearch.x)}
            cy={sy(cartSearch.y)}
            r={highlightedTrackId === id ? 6 : 4}
            fill="none"
            stroke={groupColor(cartSearch.group)}
            strokeWidth={highlightedTrackId === id ? 2.5 : 1.4}
            opacity={dim(cartSearch.group)}
            style={{ cursor: 'pointer' }}
            onClick={() => onPointClick(id)}
          >
            <title>{`${title} · Fit ${cartSearch.fit}`}</title>
          </circle>
        ))}
      </svg>
      <div className="cart-search-map-legend">
        {result.groups.map((group) => (
          <span key={group.index} style={{ opacity: dim(group.index) }}>
            <GroupDot group={group.index} /> {shortName(group.name)}
          </span>
        ))}
        <span>● in cart</span>
        <span>○ result</span>
        <span className="cart-search-map-note">Closer means more alike. Click a ring to find its row.</span>
      </div>
    </div>
  )
}

/**
 * Header rows for the cart similarity search results: group-count slider, New artists only, Map toggle, counts,
 * the session's "Not this" list, group chips with Save group as cart, and the map. Rendered inside the track
 * table's <thead>, so every row is a <tr> with a single cell.
 */
const CartSearchControls = ({
  cartSearch,
  tracks,
  searchInProgress,
  highlightedTrackId,
  onChange,
  onSaveGroup,
  onPointClick,
}) => {
  const { result, chip, k, newArtistsOnly, misses, mapOpen, saved, toast } = cartSearch
  const [saving, setSaving] = useState(null)
  const [saveName, setSaveName] = useState('')
  const [saveInProgress, setSaveInProgress] = useState(false)
  const [kInput, setKInput] = useState(String(k || ''))

  useEffect(() => setKInput(String(k || '')), [k])
  useEffect(() => setSaving(null), [chip, k])

  const groups = result?.groups || []
  const maxK = Math.max(1, result?.maxK || 1)
  const excluded = result?.excluded || { heard: 0, ignored: 0, purchased: 0, knownArtists: 0 }
  const cartTracks = result?.cartTracks
  const selectedGroup = chip === 'all' ? null : groups[chip]
  const savedGroup = selectedGroup && saved.find((s) => s.k === k && s.group === chip)
  const cartLabel = (cartSearch.name || '').replace(/^zz \S+ /, '')
  const currentK = Math.min(k || 1, maxK)

  // Fewer groups is coarser, more is finer. An empty or out-of-range entry snaps back into 1…maxK.
  const commitK = (value) => {
    const next = Math.min(Math.max(1, Math.round(value) || currentK), maxK)
    setKInput(String(next))
    if (next !== k) onChange({ k: next })
  }

  const startSaving = () => {
    setSaving(chip)
    setSaveName(`${cartLabel.split(' · ')[0] || 'Cart'} · ${shortName(selectedGroup.name)}`)
  }

  const submitSave = async (e) => {
    e.preventDefault()
    if (!saveName.trim()) return
    setSaveInProgress(true)
    try {
      await onSaveGroup(chip, saveName.trim())
      setSaving(null)
    } finally {
      setSaveInProgress(false)
    }
  }

  const resultCount = tracks.length
  return (
    <>
      <tr className="cart-search-row">
        <th className="cart-search-cell">
          <div className="cart-search-toolbar">
            <span className="cart-search-control cart-search-stepper" role="group" aria-label="Groups, coarse to fine">
              <button
                type="button"
                className="button button-push_button button-push_button-small button-push_button-primary"
                disabled={!result || currentK <= 1}
                title="Coarser: fewer, broader groups"
                aria-label="Coarser"
                data-testid="cart-search-coarser"
                onClick={() => commitK(currentK - 1)}
              >
                <FontAwesomeIcon icon="minus" />
              </button>
              <input
                className="text-input text-input-small text-input-dark"
                inputMode="numeric"
                value={kInput}
                disabled={!result || maxK < 2}
                title={`Number of groups, 1–${maxK}`}
                aria-label="Number of groups"
                data-testid="cart-search-k"
                onChange={(e) => setKInput(e.target.value.replace(/\D/g, ''))}
                onBlur={() => commitK(Number(kInput))}
                onKeyDown={(e) => e.key === 'Enter' && commitK(Number(kInput))}
              />
              <button
                type="button"
                className="button button-push_button button-push_button-small button-push_button-primary"
                disabled={!result || currentK >= maxK}
                title="Finer: more, narrower groups"
                aria-label="Finer"
                data-testid="cart-search-finer"
                onClick={() => commitK(currentK + 1)}
              >
                <FontAwesomeIcon icon="plus" />
              </button>
            </span>
            <label className="cart-search-control">
              <input
                type="checkbox"
                checked={newArtistsOnly}
                data-testid="cart-search-new-only"
                onChange={(e) => onChange({ newArtistsOnly: e.target.checked })}
              />
              New artists only
            </label>
            <span className="select-button--container cart-search-toggle">
              <button
                type="button"
                className={`select_button-button select_button-button__small ${mapOpen ? 'select_button-button__active' : ''}`}
                aria-pressed={mapOpen}
                title={`${mapOpen ? 'Hide' : 'Show'} the map`}
                data-testid="cart-search-map-toggle"
                onClick={() => onChange({ mapOpen: !mapOpen })}
              >
                <FontAwesomeIcon icon="map" /> Map
              </button>
            </span>
          </div>
          <span
            className="cart-search-counts"
            title={`Always left out: ${excluded.heard} heard, ${excluded.ignored} ignored (artist, label, release or artist on label), ${excluded.purchased} purchased`}
          >
            {!searchInProgress && result && (
              <>
                <b>{resultCount} results</b>
                {newArtistsOnly && excluded.knownArtists > 0 && (
                  <span> ({excluded.knownArtists} by known artists hidden)</span>
                )}{' '}
                <span>
                  · left out {excluded.heard} heard, {excluded.ignored} ignored, {excluded.purchased} purchased
                </span>
              </>
            )}
          </span>
          {cartTracks && cartTracks.used < cartTracks.total && (
            <span className="cart-search-limit cart-search-line" data-testid="cart-search-limit">
              <FontAwesomeIcon icon="circle-info" /> Groups formed from the {cartTracks.used} most recently added of the
              cart’s {cartTracks.total} tracks
              {cartTracks.analysed < cartTracks.total
                ? ` (${cartTracks.total - cartTracks.analysed} not analysed yet)`
                : ''}
              {cartTracks.used === cartTracks.limit ? ` · at most ${cartTracks.limit} tracks are used` : ''}
            </span>
          )}
          {toast && <span className="cart-search-toast cart-search-line">{toast}</span>}
          {misses.length > 0 && (
            <span className="cart-search-misses cart-search-line">
              Not this ({misses.length}):
              {misses.map(({ id, label }) => (
                <span className="search_pill" key={id}>
                  <span className="search_pill_type">miss</span>
                  <span className="search_pill_name">{label}</span>
                  <button
                    className="search_pill_remove"
                    aria-label={`Undo Not this for ${label}`}
                    onClick={() => onChange({ misses: misses.filter((m) => m.id !== id), toast: '' })}
                  >
                    <FontAwesomeIcon icon="times" />
                  </button>
                </span>
              ))}
              <button className="button pill pill-button" onClick={() => onChange({ misses: [], toast: '' })}>
                <span className="pill-button-contents">Clear all</span>
              </button>
            </span>
          )}
        </th>
      </tr>
      {groups.length > 0 && (
        <tr className="cart-search-row">
          <th className="cart-search-cell">
            <div
              className="select-button select-button--container state-select-button--container noselect cart-search-chips"
              role="radiogroup"
              aria-label="Groups"
            >
              <input
                type="radio"
                id="cart-search-chip-all"
                name="cart-search-chip"
                checked={chip === 'all'}
                onChange={() => onChange({ chip: 'all' })}
              />
              <label
                className="select_button-button select_button-button__small cart-search-chip"
                htmlFor="cart-search-chip-all"
                data-testid="cart-search-chip-all"
              >
                All <small>{result.tracks.length}</small>
              </label>
              {groups.map((group) => (
                <React.Fragment key={group.index}>
                  <input
                    type="radio"
                    id={`cart-search-chip-${group.index}`}
                    name="cart-search-chip"
                    checked={chip === group.index}
                    onChange={() => onChange({ chip: group.index })}
                  />
                  <label
                    className="select_button-button select_button-button__small cart-search-chip"
                    htmlFor={`cart-search-chip-${group.index}`}
                    data-testid="cart-search-chip"
                    title={`${group.size} cart tracks`}
                  >
                    <GroupDot group={group.index} size={11} />
                    <span className="cart-search-chip-name">{shortName(group.name)}</span>
                    <small>{group.resultCount}</small>
                    {saved.some((s) => s.k === k && s.group === group.index) && (
                      <FontAwesomeIcon icon="cart-shopping" />
                    )}
                  </label>
                </React.Fragment>
              ))}
            </div>
            {savedGroup ? (
              <span className="cart-search-save cart-search-saved">
                <FontAwesomeIcon icon="check" /> Saved as cart “{savedGroup.name}” · {selectedGroup.size} tracks
              </span>
            ) : selectedGroup && saving === chip ? (
              <form className="cart-search-save cart-search-save-form" onSubmit={submitSave}>
                <input
                  className="text-input text-input-large text-input-dark"
                  value={saveName}
                  aria-label="New cart name"
                  data-testid="cart-search-save-name"
                  autoFocus
                  onChange={(e) => setSaveName(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={saveInProgress}
                  className="button button-push_button button-push_button-small button-push_button-primary"
                  data-testid="cart-search-save-submit"
                >
                  <FontAwesomeIcon icon="cart-plus" /> Create cart ({selectedGroup.size} tracks)
                </button>
                <button
                  type="button"
                  className="button button-push_button button-push_button-small button-push_button-primary"
                  onClick={() => setSaving(null)}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="button button-push_button button-push_button-small button-push_button-primary cart-search-save"
                disabled={!selectedGroup}
                title={
                  selectedGroup
                    ? `Create a new cart from this group's ${selectedGroup.size} tracks`
                    : 'Pick a group to save it as a cart'
                }
                data-testid="cart-search-save"
                onClick={startSaving}
              >
                <FontAwesomeIcon icon="cart-plus" /> Save group as cart
              </button>
            )}
          </th>
        </tr>
      )}
      {mapOpen && result && (
        <tr className="cart-search-row">
          <th className="cart-search-cell">
            <CartSearchMap
              result={result}
              tracks={tracks}
              chip={chip}
              highlightedTrackId={highlightedTrackId}
              onPointClick={onPointClick}
            />
          </th>
        </tr>
      )}
    </>
  )
}

export default CartSearchControls
