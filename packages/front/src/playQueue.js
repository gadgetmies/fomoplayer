// Where the current track is playing from and which tracks next / previous step through. Next follows the list the
// track was started from, not the list on screen: the live list while it is on screen (so paging and heard state stay
// current), otherwise the snapshot taken when playback started.

const DISCOVER_LABELS = { new: 'New', recent: 'Recent', heard: 'Heard' }

export const samplesSource = { key: 'samples', label: 'Audio samples', path: '/settings/notifications' }

// The source for the list on screen. `location` is `{ pathname, search }`, used for searches so the link keeps the
// filters.
export const listSource = ({ listState, selectedCart, location }) => {
  if (DISCOVER_LABELS[listState]) {
    return { key: listState, label: `Discover · ${DISCOVER_LABELS[listState]}`, path: `/tracks/${listState}` }
  }
  if (listState === 'carts' && selectedCart) {
    return {
      key: `cart:${selectedCart.uuid}`,
      label: `Cart · ${selectedCart.name}`,
      path: `/carts/${selectedCart.uuid}`,
    }
  }
  if (listState === 'search') {
    const search = location?.search || ''
    const query = new URLSearchParams(search).get('q') || ''
    return { key: `search:${search}`, label: `Search · ${query}`, path: `/search/${search}` }
  }
  return null
}

export const queueTracks = (playingFrom, onScreen) => {
  if (!playingFrom?.source) return onScreen?.tracks || []
  if (onScreen?.source && onScreen.source.key === playingFrom.source.key) return onScreen.tracks || []
  return playingFrom.tracks?.length ? playingFrom.tracks : onScreen?.tracks || []
}

// The track `step` positions away from `currentId`, skipping tracks `isPlayable` rejects, or null at either end.
// A current track missing from the list starts from the top.
export const stepInQueue = (tracks, currentId, step, isPlayable = () => true) => {
  const currentIndex = tracks.findIndex(({ id }) => id === currentId)
  const direction = step < 0 ? -1 : 1
  let index = currentIndex === -1 ? (direction > 0 ? -1 : tracks.length) : currentIndex
  let remaining = Math.abs(step)
  while (remaining > 0) {
    index += direction
    if (index < 0 || index >= tracks.length) return null
    if (isPlayable(tracks[index])) remaining -= 1
  }
  return tracks[index]
}

// An uploaded audio sample as a track-like item the player can play.
export const sampleAsTrack = ({ id, url, filename }) => ({
  id: `sample-${id}`,
  sampleId: id,
  kind: 'sample',
  title: filename,
  version: null,
  artists: [],
  remixers: [],
  labels: [],
  releases: [],
  keys: [],
  genres: [],
  stores: [],
  released: null,
  published: null,
  previews: [{ id: `sample-${id}`, store: 'sample', format: 'mp3', url, waveforms: [], start_ms: null, end_ms: null }],
})

export const isSample = (track) => track?.kind === 'sample'
