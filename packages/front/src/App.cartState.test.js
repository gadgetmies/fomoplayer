import App from './App'
import { requestJSONwithCredentials } from './request-json-with-credentials.js'
import { emptyCartReview } from './cartReview'

// The selected cart as the app keeps it: after a track is added to or removed from a cart with a cart button (the rows
// of the cart on screen and the play-queue snapshot carry each track's cart membership, which the cart menus and the
// player read), and when the player asks for more of the cart. The App is used without rendering; the server
// requests are the boundary.

jest.mock('./request-json-with-credentials.js', () => ({
  requestJSONwithCredentials: jest.fn(),
  requestWithCredentials: jest.fn(),
}))

const shown = { id: 1, uuid: 'uuid-shown', name: 'On screen' }
const other = { id: 2, uuid: 'uuid-other', name: 'Other' }
const inBoth = { carts: [{ uuid: shown.uuid }, { uuid: other.uuid }] }
const inShown = { carts: [{ uuid: shown.uuid }] }

const makeApp = (state = {}) => {
  const app = new App({})
  app.setState = (update) => {
    const partial = typeof update === 'function' ? update(app.state) : update
    if (partial) app.state = { ...app.state, ...partial }
  }
  const selectedCart = {
    ...shown,
    tracks: [
      { id: 10, ...inBoth },
      { id: 11, ...inShown },
    ],
  }
  app.state = {
    ...app.state,
    listState: 'carts',
    carts: [selectedCart, { ...other, tracks: [{ id: 10, ...inBoth }] }],
    selectedCart,
    selectedCartUuid: shown.uuid,
    ...state,
  }
  return app
}

const serverCart = (cart, tracks) => ({ cart: { ...cart, trackCount: tracks.length }, tracks })
const membershipOf = (tracks, id) => tracks.find((track) => track.id === id).carts.map(({ uuid }) => uuid)

beforeEach(() => requestJSONwithCredentials.mockReset())

describe('changing another cart from a row of the cart on screen', () => {
  it('removing the track from the other cart shows it out of that cart in the row', async () => {
    const app = makeApp()
    requestJSONwithCredentials.mockResolvedValue(serverCart(other, []))
    await app.removeFromCart(other.id, 10)
    expect(membershipOf(app.state.selectedCart.tracks, 10)).toEqual([shown.uuid])
    const listed = app.state.carts.find(({ id }) => id === shown.id)
    expect(membershipOf(listed.tracks, 10)).toEqual([shown.uuid])
  })

  it('adding the track to the other cart shows it in that cart in the row', async () => {
    const app = makeApp()
    requestJSONwithCredentials.mockResolvedValue(serverCart(other, [{ id: 11 }, { id: 10 }]))
    await app.addToCart(other.id, 11)
    expect(membershipOf(app.state.selectedCart.tracks, 11)).toEqual([shown.uuid, other.uuid])
  })

  it('keeps the rows of the cart on screen in place', async () => {
    const app = makeApp()
    requestJSONwithCredentials.mockResolvedValue(serverCart(other, []))
    await app.removeFromCart(other.id, 10)
    expect(app.state.selectedCart.tracks.map(({ id }) => id)).toEqual([10, 11])
    expect(app.state.selectedCart.name).toBe('On screen')
  })
})

describe('removing a track from the cart it plays from', () => {
  const source = { key: `cart:${shown.uuid}`, label: 'Cart · On screen', path: `/carts/${shown.uuid}` }

  it('marks the track out of the cart in the play-queue snapshot and keeps it playing', async () => {
    const snapshot = [
      { id: 10, ...inBoth },
      { id: 11, ...inShown },
    ]
    const app = makeApp({
      listState: 'new',
      currentTrack: snapshot[1],
      playingFrom: { source, tracks: snapshot },
    })
    requestJSONwithCredentials.mockResolvedValue(serverCart(shown, [{ id: 10 }]))
    await app.removeFromCart(shown.id, 11)
    expect(membershipOf(app.state.playingFrom.tracks, 11)).toEqual([])
    expect(membershipOf(app.state.playingFrom.tracks, 10)).toEqual([shown.uuid, other.uuid])
    expect(app.state.playingFrom.source).toBe(source)
    expect(app.state.currentTrack.id).toBe(11)
  })

  it('marks it back in the cart in the snapshot when it is added again', async () => {
    const app = makeApp({ playingFrom: { source, tracks: [{ id: 11, carts: [] }] } })
    requestJSONwithCredentials.mockResolvedValue(serverCart(shown, [{ id: 11 }]))
    await app.addToCart(shown.id, 11)
    expect(membershipOf(app.state.playingFrom.tracks, 11)).toEqual([shown.uuid])
  })
})

describe('loading more of the cart under review for the player', () => {
  const page = (tracks, total) => ({
    cart: { ...shown, review: { enabled: true, counts: null, storeCounts: [] } },
    tracks,
    page: { total },
  })
  const reviewedApp = (state = {}) =>
    makeApp({
      cartPagination: { offset: 0, count: 2, total: 4, loadingMore: false },
      cartReview: { ...emptyCartReview, cartUuid: shown.uuid, cartId: shown.id, available: true, enabled: true },
      ...state,
    })

  it('resolves with the rows of the next page and lists them in the cart', async () => {
    const app = reviewedApp({ listState: 'new' })
    requestJSONwithCredentials.mockResolvedValue(page([{ id: 12, reviewState: null, ...inShown }], 4))
    const appended = await app.loadMoreCartTracks(shown.uuid)
    expect(appended.map(({ id }) => id)).toEqual([12])
    expect(app.state.selectedCart.tracks.map(({ id }) => id)).toEqual([10, 11, 12])
    expect(requestJSONwithCredentials.mock.calls[0][0].path).toContain(`/carts/${shown.uuid}?offset=2`)
  })

  it('shares a page that is already loading instead of asking for it twice', async () => {
    const app = reviewedApp()
    requestJSONwithCredentials.mockResolvedValue(page([{ id: 12, ...inShown }], 4))
    const [first, second] = await Promise.all([app.loadMoreCartTracks(shown.uuid), app.loadMoreCartTracks(shown.uuid)])
    expect(requestJSONwithCredentials).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })

  it('resolves with nothing at the end of the cart or for another cart', async () => {
    const app = reviewedApp({ cartPagination: { offset: 0, count: 2, total: 2, loadingMore: false } })
    expect(await app.loadMoreCartTracks(shown.uuid)).toBe(null)
    expect(await reviewedApp().loadMoreCartTracks(other.uuid)).toBe(null)
    expect(requestJSONwithCredentials).not.toHaveBeenCalled()
  })

  it('resolves with nothing when the server has no more rows', async () => {
    const app = reviewedApp()
    requestJSONwithCredentials.mockResolvedValue(page([], 4))
    expect(await app.loadMoreCartTracks(shown.uuid)).toBe(null)
  })
})
