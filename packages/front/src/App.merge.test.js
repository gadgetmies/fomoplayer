import {
  loadedCartTrackCount,
  mergeCartDetailsPreservingTracks,
  mergeCartListPreservingTracks,
  patchTrackCarts,
  patchTrackCartMembership,
} from './App'

const cart = (id, tracks = [], extra = {}) => ({
  id,
  uuid: `uuid-${id}`,
  name: 'cart',
  isDefault: false,
  isPublic: false,
  isPurchased: false,
  storeDetails: [],
  trackCount: tracks.length,
  tracks,
  ...extra,
})

describe('mergeCartDetailsPreservingTracks', () => {
  it('preserves the in-memory tracks when adding a track and prepends the new row', () => {
    const existing = cart(1, [{ id: 10, title: 'a' }, { id: 11, title: 'b' }, { id: 12, title: 'c' }])
    const response = cart(1, [{ id: 99, title: 'new' }, { id: 10, title: 'a' }, { id: 11, title: 'b' }], {
      trackCount: 4,
    })
    const merged = mergeCartDetailsPreservingTracks(existing, response, { addedTrackId: 99 })
    expect(merged.tracks.map((t) => t.id)).toEqual([99, 10, 11, 12])
    expect(merged.trackCount).toBe(4)
  })

  it('does not duplicate when adding a track that is already in memory', () => {
    const existing = cart(1, [{ id: 99, title: 'new' }, { id: 10, title: 'a' }])
    const response = cart(1, [{ id: 99, title: 'new' }, { id: 10, title: 'a' }], { trackCount: 2 })
    const merged = mergeCartDetailsPreservingTracks(existing, response, { addedTrackId: 99 })
    expect(merged.tracks.map((t) => t.id)).toEqual([99, 10])
  })

  it('splices out an in-memory track on remove and preserves order', () => {
    const existing = cart(1, [{ id: 10 }, { id: 11 }, { id: 12 }])
    const response = cart(1, [{ id: 10 }, { id: 12 }], { trackCount: 2 })
    const merged = mergeCartDetailsPreservingTracks(existing, response, { removedTrackId: 11 })
    expect(merged.tracks.map((t) => t.id)).toEqual([10, 12])
    expect(merged.trackCount).toBe(2)
  })

  it('leaves tracks unchanged but updates total when removing a not-loaded track', () => {
    const existing = cart(1, [{ id: 10 }, { id: 11 }])
    const response = cart(1, [{ id: 10 }, { id: 11 }], { trackCount: 99 })
    const merged = mergeCartDetailsPreservingTracks(existing, response, { removedTrackId: 999 })
    expect(merged.tracks.map((t) => t.id)).toEqual([10, 11])
    expect(merged.trackCount).toBe(99)
  })

  it('merges top-level metadata from the response', () => {
    const existing = cart(1, [{ id: 10 }], { name: 'old', isPublic: false, storeDetails: [] })
    const response = cart(1, [{ id: 10 }], {
      name: 'new name',
      isPublic: true,
      storeDetails: [{ storeName: 'spotify' }],
      trackCount: 1,
    })
    const merged = mergeCartDetailsPreservingTracks(existing, response)
    expect(merged.name).toBe('new name')
    expect(merged.isPublic).toBe(true)
    expect(merged.storeDetails).toEqual([{ storeName: 'spotify' }])
    expect(merged.tracks.map((t) => t.id)).toEqual([10])
  })

  it('handles an existing cart with no tracks array', () => {
    const existing = { id: 1, uuid: 'uuid-1', name: 'empty' }
    const response = cart(1, [{ id: 10 }], { trackCount: 1 })
    const merged = mergeCartDetailsPreservingTracks(existing, response, { addedTrackId: 10 })
    expect(merged.tracks.map((t) => t.id)).toEqual([10])
    expect(merged.trackCount).toBe(1)
  })
})

describe('patchTrackCarts', () => {
  it('appends a { uuid } object to an empty carts array', () => {
    const result = patchTrackCarts({ id: 1, carts: [] }, 'uuid-7', 'add')
    expect(result.carts).toEqual([{ uuid: 'uuid-7' }])
  })

  it('is idempotent on add (does not duplicate)', () => {
    const result = patchTrackCarts({ id: 1, carts: [{ uuid: 'uuid-7' }] }, 'uuid-7', 'add')
    expect(result.carts).toEqual([{ uuid: 'uuid-7' }])
  })

  it('removes the matching uuid', () => {
    const result = patchTrackCarts(
      { id: 1, carts: [{ uuid: 'uuid-3' }, { uuid: 'uuid-7' }, { uuid: 'uuid-9' }] },
      'uuid-7',
      'remove',
    )
    expect(result.carts).toEqual([{ uuid: 'uuid-3' }, { uuid: 'uuid-9' }])
  })

  it('is idempotent on remove (no-op when absent)', () => {
    const result = patchTrackCarts(
      { id: 1, carts: [{ uuid: 'uuid-3' }, { uuid: 'uuid-9' }] },
      'uuid-7',
      'remove',
    )
    expect(result.carts).toEqual([{ uuid: 'uuid-3' }, { uuid: 'uuid-9' }])
  })

  it('treats absent or non-array carts as []', () => {
    expect(patchTrackCarts({ id: 1 }, 'uuid-7', 'add').carts).toEqual([{ uuid: 'uuid-7' }])
    expect(patchTrackCarts({ id: 1, carts: null }, 'uuid-7', 'add').carts).toEqual([{ uuid: 'uuid-7' }])
  })

  it('returns a fresh object so React detects the change', () => {
    const input = { id: 1, carts: [] }
    const result = patchTrackCarts(input, 'uuid-7', 'add')
    expect(result).not.toBe(input)
  })
})

describe('patchTrackCartMembership', () => {
  it('updates the affected track in every slice that contains it', () => {
    const slices = {
      new: [{ id: 1, carts: [] }, { id: 2, carts: [] }],
      heard: [{ id: 1, carts: [] }],
      recentlyAdded: [{ id: 3, carts: [] }],
      searchResults: [{ id: 1, carts: [] }],
      selectedCartTracks: [{ id: 1, carts: [] }],
    }
    const out = patchTrackCartMembership(slices, 1, 'uuid-7', 'add')
    expect(out.new[0].carts).toEqual([{ uuid: 'uuid-7' }])
    expect(out.new[1].carts).toEqual([])
    expect(out.heard[0].carts).toEqual([{ uuid: 'uuid-7' }])
    expect(out.searchResults[0].carts).toEqual([{ uuid: 'uuid-7' }])
    expect(out.selectedCartTracks[0].carts).toEqual([{ uuid: 'uuid-7' }])
  })

  it('returns reference-equal slices when no row matches', () => {
    const slices = {
      new: [{ id: 1, carts: [] }],
      heard: [{ id: 2, carts: [] }],
      recentlyAdded: [],
      searchResults: undefined,
      selectedCartTracks: null,
    }
    const out = patchTrackCartMembership(slices, 999, 'uuid-7', 'add')
    expect(out.new).toBe(slices.new)
    expect(out.heard).toBe(slices.heard)
    expect(out.recentlyAdded).toBe(slices.recentlyAdded)
  })

  it('handles undefined / null slices without throwing', () => {
    const out = patchTrackCartMembership(
      { new: undefined, heard: null, recentlyAdded: undefined, searchResults: undefined, selectedCartTracks: undefined },
      1,
      'uuid-7',
      'add',
    )
    expect(out.new).toBeUndefined()
    expect(out.heard).toBeNull()
  })

  it('removes the matching uuid when op is remove', () => {
    const slices = {
      new: [{ id: 1, carts: [{ uuid: 'uuid-3' }, { uuid: 'uuid-7' }] }],
      heard: undefined,
      recentlyAdded: undefined,
      searchResults: undefined,
      selectedCartTracks: undefined,
    }
    const out = patchTrackCartMembership(slices, 1, 'uuid-7', 'remove')
    expect(out.new[0].carts).toEqual([{ uuid: 'uuid-3' }])
  })
})

describe('keeping a removed track listed in the cart on screen', () => {
  it('keeps the removed row in place, with the cart membership it was given', () => {
    const existing = cart(1, [{ id: 10 }, { id: 11, carts: [] }, { id: 12 }])
    const response = cart(1, [{ id: 10 }, { id: 12 }], { trackCount: 2 })
    const merged = mergeCartDetailsPreservingTracks(existing, response, { removedTrackId: 11, keepRemovedRow: true })
    expect(merged.tracks.map((t) => t.id)).toEqual([10, 11, 12])
    expect(merged.tracks[1].carts).toEqual([])
    expect(merged.trackCount).toBe(2)
  })

  it('does not duplicate the row when the removed track is added back', () => {
    const existing = cart(1, [{ id: 10 }, { id: 11, carts: [{ uuid: 'uuid-1' }] }])
    const response = cart(1, [{ id: 11 }, { id: 10 }], { trackCount: 2 })
    const merged = mergeCartDetailsPreservingTracks(existing, response, { addedTrackId: 11 })
    expect(merged.tracks.map((t) => t.id)).toEqual([10, 11])
  })

  it('pages on from the rows still in the cart, not the rows listed', () => {
    const inCart = { carts: [{ uuid: 'uuid-1' }, { uuid: 'other' }] }
    const tracks = [{ id: 10, ...inCart }, { id: 11, carts: [{ uuid: 'other' }] }, { id: 12, ...inCart }]
    expect(loadedCartTrackCount(tracks, 'uuid-1')).toBe(2)
  })
})

describe('mergeCartListPreservingTracks', () => {
  it('keeps the loaded tracks of carts listed without tracks', () => {
    const existing = [cart(1, [{ id: 10 }, { id: 11 }]), cart(2, [{ id: 20 }])]
    const fresh = [
      { ...cart(1), tracks: undefined, name: 'renamed', trackCount: 5 },
      { ...cart(3), tracks: undefined },
    ]
    const merged = mergeCartListPreservingTracks(existing, fresh)
    expect(merged.map((c) => c.id)).toEqual([1, 3])
    expect(merged[0].tracks.map((t) => t.id)).toEqual([10, 11])
    expect(merged[0].name).toBe('renamed')
    expect(merged[0].trackCount).toBe(5)
    expect(merged[1].tracks).toBeUndefined()
  })
})
