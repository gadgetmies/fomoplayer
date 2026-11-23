// Where the current track is playing from and which tracks next / previous step through. Next follows the list the
// track was started from, not the list on screen: the live list while it is on screen (so paging and heard state stay
// current), otherwise the snapshot taken when playback started.

const DISCOVER_LABELS = { new: 'New', recent: 'Recent', heard: 'Heard' }

export const samplesSource = { key: 'samples', label: 'Audio samples', path: '/notifications/samples' }

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

// Whether the view on screen is the one the track plays from, so the player need not link back to it: the list on
// screen is the source, or the address is the source's own (the notifications tabs, which have no list source).
export const isViewingSource = (source, { onScreenSource, location }) => {
  if (!source) return false
  if (onScreenSource && onScreenSource.key === source.key) return true
  return Boolean(location) && `${location.pathname}${location.search || ''}` === source.path
}

// The tracks of a source the app still holds in its state: the Discover lists and the carts it has loaded. Null for a
// source it does not hold (an earlier search, the audio samples). `held` is `{ tracks, heardTracks, carts }`, where
// `tracks` holds the Discover lists by list name.
export const heldSourceTracks = (source, held = {}) => {
  if (!source) return null
  if (source.key === 'new') return held.tracks?.new || null
  if (source.key === 'recent') return held.tracks?.recentlyAdded || null
  if (source.key === 'heard') return held.heardTracks || null
  if (source.key.startsWith('cart:')) {
    return (held.carts || []).find(({ uuid }) => `cart:${uuid}` === source.key)?.tracks || null
  }
  return null
}

// The tracks next / previous step through. Without a source, the list on screen. With one: the live list while it is
// on screen, otherwise the snapshot taken when playback started, otherwise (the snapshot is lost when the page
// reloads) the source's tracks the app still holds. Null when none of these has the source's tracks, so the caller
// does not step through the list on screen while the player still names the source.
export const queueTracks = (playingFrom, onScreen, heldTracks) => {
  if (!playingFrom?.source) return onScreen?.tracks || []
  if (onScreen?.source && onScreen.source.key === playingFrom.source.key) return onScreen.tracks || []
  if (playingFrom.tracks?.length) return playingFrom.tracks
  return heldTracks?.length ? heldTracks : null
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

// An uploaded audio sample as a track-like item the player can play. A sample with a waveform rendered at upload
// carries it and its duration as a preview spanning the whole sample; one without (rendering failed, or uploaded
// before waveforms were rendered) leaves start_ms null, so the player generates the waveform from the audio.
export const sampleAsTrack = ({ id, url, filename, waveformUrl, durationMs }) => ({
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
  duration: durationMs ?? undefined,
  previews: [
    waveformUrl && durationMs
      ? {
          id: `sample-${id}`,
          store: 'sample',
          format: 'mp3',
          url,
          waveforms: [waveformUrl],
          start_ms: 0,
          end_ms: durationMs,
          length_ms: durationMs,
        }
      : { id: `sample-${id}`, store: 'sample', format: 'mp3', url, waveforms: [], start_ms: null, end_ms: null },
  ],
})

export const isSample = (track) => track?.kind === 'sample'
