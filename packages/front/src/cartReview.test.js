import {
  acceptedStoreCounts,
  acceptedUrlsToOpen,
  applyLocalDecisions,
  countsAfterDecision,
  emptyCartReview,
  isSkippedInReview,
  openAcceptedNotice,
  openInNewTabs,
  reviewedTracksNotice,
  reviewQuery,
  reviewRequestStores,
} from './cartReview'
import { stepInQueue } from './playQueue'

const reviewing = (overrides = {}) => ({
  ...emptyCartReview,
  cartUuid: 'cart-1',
  available: true,
  enabled: true,
  ...overrides,
})

const beatport = (id, reviewState = null) => ({ id, reviewState, stores: [{ name: 'Beatport' }] })
const bandcamp = (id, reviewState = null) => ({ id, reviewState, stores: [{ name: 'Bandcamp' }] })

describe('the player while a cart is reviewed', () => {
  const queue = [beatport(1), beatport(2, 'accepted'), bandcamp(3), beatport(4, 'rejected'), beatport(5)]
  const step = (cartReview, sourceKey, from) =>
    stepInQueue(queue, from, 1, (track) => !isSkippedInReview(track, cartReview, sourceKey))?.id

  it('steps past accepted and rejected tracks', () => {
    expect(step(reviewing(), 'cart:cart-1', 1)).toBe(3)
    expect(step(reviewing(), 'cart:cart-1', 3)).toBe(5)
  })

  it('steps past a track decided after its row was loaded', () => {
    expect(step(reviewing({ states: { 3: 'accepted' } }), 'cart:cart-1', 1)).toBe(5)
  })

  it('steps only through the selected store', () => {
    expect(step(reviewing({ storeFocus: 'beatport' }), 'cart:cart-1', 1)).toBe(5)
  })

  it('steps through every track when review is off', () => {
    expect(step(reviewing({ enabled: false }), 'cart:cart-1', 1)).toBe(2)
  })

  it('steps past a track removed from the cart while it is reviewed, on every review tab', () => {
    const inCart = (track, carts) => ({ ...track, carts })
    const removed = [
      inCart(beatport(1), [{ uuid: 'cart-1' }]),
      inCart(beatport(2), [{ uuid: 'cart-2' }]),
      inCart(beatport(3), [{ uuid: 'cart-1' }]),
    ]
    for (const reviewFilter of ['all', 'to-review']) {
      const next = stepInQueue(
        removed,
        1,
        1,
        (track) => !isSkippedInReview(track, reviewing({ reviewFilter }), 'cart:cart-1'),
      )
      expect(next.id).toBe(3)
    }
  })

  it('counts a row without its carts listed as in the cart', () => {
    expect(isSkippedInReview(beatport(1), reviewing(), 'cart:cart-1')).toBe(false)
  })

  it('steps through every track when playing from another list', () => {
    expect(step(reviewing(), 'new', 1)).toBe(2)
    expect(step(reviewing(), 'cart:cart-2', 1)).toBe(2)
  })
})

describe('a cart page under review', () => {
  it('asks for the selected review tab and only the selected store', () => {
    // All is the default tab.
    expect(reviewQuery(reviewing())).toBe('')
    expect(reviewQuery(reviewing({ reviewFilter: 'to-review' }))).toBe('&review=to-review')
    expect(reviewRequestStores(reviewing({ storeFocus: 'bandcamp' }))).toEqual(['bandcamp'])
    expect(reviewRequestStores(reviewing())).toBe(undefined)
    expect(reviewQuery(reviewing({ enabled: false }))).toBe('')
    expect(reviewRequestStores(reviewing({ enabled: false, storeFocus: 'bandcamp' }))).toBe(undefined)
  })

  it('keeps a local decision over a row from a page requested before it', () => {
    const page = [beatport(1), beatport(2), beatport(3, 'accepted')]
    const rows = applyLocalDecisions(page, { 2: 'rejected', 3: null }, 'to-review')
    expect(rows.map(({ id, reviewState }) => [id, reviewState])).toEqual([
      [1, null],
      [3, null],
    ])
  })

  it('moves one count to another on a decision', () => {
    const counts = { toReview: 3, accepted: 1, rejected: 0, all: 4 }
    expect(countsAfterDecision(counts, null, 'accepted')).toEqual({ toReview: 2, accepted: 2, rejected: 0, all: 4 })
    expect(countsAfterDecision(counts, 'accepted', null)).toEqual({ toReview: 4, accepted: 0, rejected: 0, all: 4 })
    expect(countsAfterDecision(counts, 'accepted', 'accepted')).toBe(counts)
  })
})

describe('opening accepted tracks', () => {
  const accepted = [
    { trackId: 1, links: [{ store: 'Beatport', url: 'bp/1' }] },
    { trackId: 2, links: [{ store: 'Bandcamp', url: 'bc/2' }, { store: 'Beatport', url: 'bp/2' }] },
    { trackId: 3, links: [{ store: 'Bandcamp', url: 'bc/3' }] },
  ]

  it('counts the accepted tracks per store', () => {
    expect(acceptedStoreCounts(accepted)).toEqual([
      { store: 'Beatport', count: 2 },
      { store: 'Bandcamp', count: 2 },
    ])
  })

  it('opens each track once, in the first included store that carries it', () => {
    expect(acceptedUrlsToOpen(accepted, ['Beatport', 'Bandcamp'])).toEqual({ urls: ['bp/1', 'bp/2', 'bc/3'], skipped: 0 })
    expect(acceptedUrlsToOpen(accepted, ['Beatport'])).toEqual({ urls: ['bp/1', 'bp/2'], skipped: 1 })
  })

  it('counts the tabs the browser blocked and says how to allow them', () => {
    const open = jest.fn((url) => (url === 'bp/1' ? {} : null))
    const result = openInNewTabs(['bp/1', 'bp/2', 'bc/3'], open)
    expect(open).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ opened: 1, blocked: 2 })
    expect(openAcceptedNotice({ blocked: 2, skipped: 0 })).toBe(
      'Your browser blocked 2 tabs. Allow pop-ups for this site, then press Open accepted again.',
    )
  })
})

it('says how many accepted or rejected tracks were removed or moved, and where', () => {
  expect(reviewedTracksNotice('rejected', { count: 3, targetCart: null })).toBe(
    'Removed 3 rejected tracks from this cart.',
  )
  expect(reviewedTracksNotice('accepted', { count: 1, targetCart: { name: 'To check later' } })).toBe(
    'Moved 1 accepted track to To check later.',
  )
})
