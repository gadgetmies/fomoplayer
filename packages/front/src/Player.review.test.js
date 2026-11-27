import Player from './Player'
import { emptyCartReview } from './cartReview'

// The player while the user reviews a cart: deciding the playing track moves on to the next track still to review,
// and next / auto-advance step over decided tracks. Player is used without rendering; its callbacks are the boundary.

const track = (id) => ({ id, previews: [{ store: 'beatport' }], stores: [{ name: 'Beatport' }] })
const T1 = track(1)
const T2 = track(2)
const T3 = track(3)
const T4 = track(4)
const cartTracks = [T1, T2, T3, T4]
const cartSource = { key: 'cart:cart-1', label: 'Cart · Gig', path: '/carts/cart-1' }

const makePlayer = ({
  currentTrack = T1,
  enabled = true,
  states = {},
  source = cartSource,
  reviewFilter = 'all',
} = {}) => {
  const props = {
    mode: 'app',
    listState: 'new',
    tracks: { new: [], recentlyAdded: [] },
    heardTracks: [],
    carts: [],
    stores: [{ storeName: 'Beatport' }],
    currentTrack,
    playingFrom: { source, tracks: cartTracks },
    cartReview: {
      ...emptyCartReview,
      cartUuid: 'cart-1',
      cartId: 11,
      available: true,
      enabled,
      reviewFilter,
      states: { 1: null, 2: null, 3: null, 4: null, ...states },
    },
    onSetCurrentTrack: jest.fn(),
    onDecideCartTrack: jest.fn(async (trackId) => props.cartReview.states[trackId]),
    onShowNotice: jest.fn(),
    onUpdateTracksClicked: jest.fn(),
  }
  return { player: new Player(props), props }
}

describe('deciding the playing track of the cart under review', () => {
  it('accepting it saves the decision and plays the next track still to review', async () => {
    const { player, props } = makePlayer({ states: { 2: 'accepted' } })
    await player.decideCartTrack(1, 'accepted')
    expect(props.onDecideCartTrack).toHaveBeenCalledWith(1, 'accepted')
    expect(props.onSetCurrentTrack.mock.calls[0][0]).toBe(T3)
  })

  it('rejecting it plays the next track still to review', async () => {
    const { player, props } = makePlayer()
    await player.decideCartTrack(1, 'rejected')
    expect(props.onSetCurrentTrack.mock.calls[0][0]).toBe(T2)
  })

  it('marking it Undecided keeps it playing', async () => {
    const { player, props } = makePlayer({ states: { 1: 'accepted' } })
    await player.decideCartTrack(1, null)
    expect(props.onDecideCartTrack).toHaveBeenCalledWith(1, null)
    expect(props.onSetCurrentTrack).not.toHaveBeenCalled()
  })

  it('deciding another track keeps the current one playing', async () => {
    const { player, props } = makePlayer()
    await player.decideCartTrack(4, 'accepted')
    expect(props.onDecideCartTrack).toHaveBeenCalledWith(4, 'accepted')
    expect(props.onSetCurrentTrack).not.toHaveBeenCalled()
  })

  it('deciding the playing track started from another list keeps it playing', async () => {
    const { player, props } = makePlayer({ source: { key: 'new', label: 'Discover · New', path: '/tracks/new' } })
    await player.decideCartTrack(1, 'accepted')
    expect(props.onSetCurrentTrack).not.toHaveBeenCalled()
  })

  it('a swipe decision shows a notice whose Undo restores the previous state', async () => {
    const { player, props } = makePlayer({ currentTrack: T2 })
    await player.decideCartTrack(4, 'rejected', { undoNotice: { title: 'Purpose' } })
    expect(props.onShowNotice).toHaveBeenCalledTimes(1)
    const [{ message, onUndo }] = props.onShowNotice.mock.calls[0]
    expect(message).toBe('Rejected Purpose')
    await onUndo()
    expect(props.onDecideCartTrack).toHaveBeenLastCalledWith(4, null)
  })
})

describe('stepping through the cart under review', () => {
  it('next skips accepted and rejected tracks', async () => {
    const { player, props } = makePlayer({ states: { 2: 'accepted', 3: 'rejected' } })
    await player.playNextTrack()
    expect(props.onSetCurrentTrack.mock.calls[0][0]).toBe(T4)
  })

  it('next steps through every track when review is off', async () => {
    const { player, props } = makePlayer({ enabled: false, states: { 2: 'accepted' } })
    await player.playNextTrack()
    expect(props.onSetCurrentTrack.mock.calls[0][0]).toBe(T2)
  })
})

describe('stepping through a review tab of the cart under review', () => {
  const decided = { 1: 'accepted', 2: null, 3: 'rejected', 4: 'accepted' }

  it('next on the Accepted tab plays the next accepted track', async () => {
    const { player, props } = makePlayer({ reviewFilter: 'accepted', states: decided })
    await player.playNextTrack()
    expect(props.onSetCurrentTrack.mock.calls[0][0]).toBe(T4)
  })

  it('next on the Rejected tab plays the next rejected track', async () => {
    const { player, props } = makePlayer({ reviewFilter: 'rejected', states: { ...decided, 1: 'rejected' } })
    await player.playNextTrack()
    expect(props.onSetCurrentTrack.mock.calls[0][0]).toBe(T3)
  })

  it('next on the To review tab plays the next track still to review', async () => {
    const { player, props } = makePlayer({ reviewFilter: 'to-review', currentTrack: T2, states: { 3: 'accepted' } })
    await player.playNextTrack()
    expect(props.onSetCurrentTrack.mock.calls[0][0]).toBe(T4)
  })

  it('accepting the playing track again on the Accepted tab keeps it playing', async () => {
    const { player, props } = makePlayer({ reviewFilter: 'accepted', states: decided })
    await player.decideCartTrack(1, 'accepted')
    expect(props.onSetCurrentTrack).not.toHaveBeenCalled()
  })

  it('rejecting the playing track on the Accepted tab plays the next accepted track', async () => {
    const { player, props } = makePlayer({ reviewFilter: 'accepted', states: decided })
    await player.decideCartTrack(1, 'rejected')
    expect(props.onDecideCartTrack).toHaveBeenCalledWith(1, 'rejected')
    expect(props.onSetCurrentTrack.mock.calls[0][0]).toBe(T4)
  })

  it('marking the playing track Undecided on the Accepted tab plays the next accepted track', async () => {
    const { player, props } = makePlayer({ reviewFilter: 'accepted', states: decided })
    await player.decideCartTrack(1, null)
    expect(props.onSetCurrentTrack.mock.calls[0][0]).toBe(T4)
  })
})
