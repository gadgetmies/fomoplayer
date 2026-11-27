import App from './App'
import { requestJSONwithCredentials } from './request-json-with-credentials.js'

// What the app keeps after a track is added to or removed from a cart with a cart button: the rows of the cart on
// screen and the play-queue snapshot carry each track's cart membership, which the cart menus and the player read.
// The App is used without rendering; the server requests are the boundary.

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
