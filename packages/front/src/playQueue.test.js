import {
  listSource,
  isViewingSource,
  queueTracks,
  stepInQueue,
  sampleAsTrack,
  samplesSource,
  isSample,
} from './playQueue'

const tracks = (...ids) => ids.map((id) => ({ id }))

describe('listSource', () => {
  it('names the Discover lists', () => {
    expect(listSource({ listState: 'recent' })).toEqual({
      key: 'recent',
      label: 'Discover · Recent',
      path: '/tracks/recent',
    })
  })

  it('names a cart by its uuid and name', () => {
    expect(listSource({ listState: 'carts', selectedCart: { uuid: 'u-1', name: 'Gig' } })).toEqual({
      key: 'cart:u-1',
      label: 'Cart · Gig',
      path: '/carts/u-1',
    })
  })

  it('names a search by its query and keeps the filters in the link', () => {
    expect(listSource({ listState: 'search', location: { search: '?q=noisia&sort=-added' } })).toEqual({
      key: 'search:?q=noisia&sort=-added',
      label: 'Search · noisia',
      path: '/search/?q=noisia&sort=-added',
    })
  })

  it('has no source for a cart that is not loaded', () => {
    expect(listSource({ listState: 'carts' })).toBeNull()
  })
})

describe('isViewingSource', () => {
  const recent = listSource({ listState: 'recent' })
  const search = listSource({ listState: 'search', location: { search: '?q=noisia' } })
  const settings = { pathname: '/settings/following', search: '' }

  it('is viewing the source while its list is on screen', () => {
    expect(isViewingSource(recent, { onScreenSource: recent, location: { pathname: '/tracks/recent' } })).toBe(true)
  })

  it('is not viewing the source while another list or view is on screen', () => {
    expect(isViewingSource(recent, { onScreenSource: listSource({ listState: 'new' }), location: settings })).toBe(
      false,
    )
    expect(isViewingSource(recent, { onScreenSource: null, location: settings })).toBe(false)
  })

  it('matches a source without a list by its address, filters included', () => {
    expect(isViewingSource(samplesSource, { location: { pathname: '/notifications/samples', search: '' } })).toBe(true)
    expect(isViewingSource(search, { location: { pathname: '/search/', search: '?q=noisia' } })).toBe(true)
    expect(isViewingSource(search, { location: { pathname: '/search/', search: '?q=other' } })).toBe(false)
  })

  it('has nothing to view without a source', () => {
    expect(isViewingSource(null, { onScreenSource: recent, location: settings })).toBe(false)
  })
})

describe('queueTracks', () => {
  const recent = listSource({ listState: 'recent' })
  const cart = listSource({ listState: 'carts', selectedCart: { uuid: 'u', name: 'c' } })

  it('uses the live list while the source is on screen', () => {
    const live = tracks(1, 2, 3)
    expect(queueTracks({ source: recent, tracks: tracks(1) }, { source: recent, tracks: live })).toBe(live)
  })

  it('uses the snapshot when another list is on screen', () => {
    const snapshot = tracks(1, 2)
    expect(queueTracks({ source: recent, tracks: snapshot }, { source: cart, tracks: tracks(9) })).toBe(snapshot)
  })

  it('falls back to the list on screen without a source or snapshot', () => {
    const live = tracks(5)
    expect(queueTracks(null, { source: cart, tracks: live })).toBe(live)
    expect(queueTracks({ source: recent, tracks: [] }, { source: cart, tracks: live })).toBe(live)
  })
})

describe('stepInQueue', () => {
  const list = tracks(1, 2, 3, 4)

  it('steps forwards and backwards', () => {
    expect(stepInQueue(list, 2, 1)).toEqual({ id: 3 })
    expect(stepInQueue(list, 2, -1)).toEqual({ id: 1 })
  })

  it('returns null past either end', () => {
    expect(stepInQueue(list, 4, 1)).toBeNull()
    expect(stepInQueue(list, 1, -1)).toBeNull()
  })

  it('skips unplayable tracks', () => {
    expect(stepInQueue(list, 1, 1, ({ id }) => id !== 2)).toEqual({ id: 3 })
  })

  it('starts from the top when the current track is not in the list', () => {
    expect(stepInQueue(list, 99, 1)).toEqual({ id: 1 })
  })
})

describe('sampleAsTrack', () => {
  it('maps a sample to a playable track-like item', () => {
    const track = sampleAsTrack({ id: 7, url: 'http://x/s.mp3', filename: 's.mp3' })
    expect(isSample(track)).toBe(true)
    expect(track).toMatchObject({ id: 'sample-7', sampleId: 7, title: 's.mp3', artists: [], stores: [] })
    expect(track.previews).toEqual([expect.objectContaining({ store: 'sample', format: 'mp3', url: 'http://x/s.mp3' })])
    expect(samplesSource.key).toBe('samples')
  })

  it('carries the waveform rendered at upload as a preview spanning the whole sample', () => {
    const track = sampleAsTrack({
      id: 7,
      url: '/api/storage/s.mp3',
      filename: 's.mp3',
      waveformUrl: '/api/storage/s.waveform.png',
      durationMs: 42000,
    })
    expect(track.duration).toBe(42000)
    expect(track.previews).toEqual([
      expect.objectContaining({
        waveforms: ['/api/storage/s.waveform.png'],
        start_ms: 0,
        end_ms: 42000,
        length_ms: 42000,
      }),
    ])
  })

  it('leaves the waveform to the player when none was rendered', () => {
    const track = sampleAsTrack({
      id: 7,
      url: '/api/storage/s.mp3',
      filename: 's.mp3',
      waveformUrl: null,
      durationMs: null,
    })
    expect(track.duration).toBeUndefined()
    expect(track.previews).toEqual([expect.objectContaining({ waveforms: [], start_ms: null, end_ms: null })])
  })
})
