// Cart review: each track in a cart is to review (state null), accepted or rejected, and the owner can turn review on
// per cart. These helpers hold the rules the cart view, the player and the bulk actions share.

export const REVIEW_TABS = [
  { key: 'to-review', label: 'To review', count: 'toReview' },
  { key: 'accepted', label: 'Accepted', count: 'accepted' },
  { key: 'rejected', label: 'Rejected', count: 'rejected' },
  { key: 'all', label: 'All', count: 'all' },
]

export const REVIEW_DECISIONS = [
  { state: 'accepted', label: 'Accept', icon: 'check' },
  { state: null, label: 'Undecided', icon: 'circle-question' },
  { state: 'rejected', label: 'Reject', icon: 'xmark' },
]

// The review view of the selected cart. `available` is true only for the cart's owner (the server sends review fields
// only to the owner). `states` holds every known track's state by id; `localStates` the decisions made here, which win
// over the rows of a page that was requested before them.
export const emptyCartReview = {
  cartUuid: undefined,
  cartId: undefined,
  available: false,
  enabled: false,
  states: {},
  localStates: {},
  storeFocus: null,
  reviewFilter: 'all',
  counts: null,
  storeCounts: [],
  acceptedLinks: [],
}

export const isReviewing = (cartReview, cartUuid) =>
  Boolean(cartReview?.available && cartReview.enabled && (cartUuid === undefined || cartReview.cartUuid === cartUuid))

// The query string (starting with `&`) that narrows a cart page to the selected review tab.
export const reviewQuery = (cartReview) =>
  isReviewing(cartReview) && cartReview.reviewFilter && cartReview.reviewFilter !== 'all'
    ? `&review=${cartReview.reviewFilter}`
    : ''

// The stores a review request is narrowed to (the store tab), or undefined for the app's stores. Requests carry the
// app's stores as `store` parameters, so the store tab replaces them rather than adding one.
export const reviewRequestStores = (cartReview) =>
  isReviewing(cartReview) && cartReview.storeFocus ? [cartReview.storeFocus] : undefined

export const matchesReviewFilter = (state, filter) =>
  !filter || filter === 'all' || (filter === 'to-review' ? !state : state === filter)

export const reviewStateOf = (track, cartReview) => {
  const states = cartReview?.states || {}
  if (Object.prototype.hasOwnProperty.call(states, track.id)) return states[track.id]
  return track.reviewState ?? null
}

// The review states of a page of cart rows, by track id.
export const reviewStatesOf = (tracks) =>
  Object.fromEntries((tracks || []).filter((track) => 'reviewState' in track).map((t) => [t.id, t.reviewState ?? null]))

// A page of rows with the local decisions applied over them, without the rows a local decision moved out of the
// selected review tab.
export const applyLocalDecisions = (tracks, localStates, reviewFilter) =>
  (tracks || [])
    .map((track) =>
      Object.prototype.hasOwnProperty.call(localStates || {}, track.id) &&
      (track.reviewState ?? null) !== localStates[track.id]
        ? { ...track, reviewState: localStates[track.id] }
        : track,
    )
    .filter((track) => !(track.id in (localStates || {})) || matchesReviewFilter(track.reviewState, reviewFilter))

export const trackOnStore = (track, store) =>
  !store || (track.stores || []).some(({ name }) => name?.toLowerCase() === store.toLowerCase())

// Whether the row is still in the cart: the cart on screen keeps listing a track removed with its cart button, with the
// cart taken out of the row's `carts`. A row without a `carts` list counts as in the cart.
export const inCart = (track, cartUuid) =>
  !Array.isArray(track.carts) || track.carts.some((cart) => cart && cart.uuid === cartUuid)

// Whether the player steps over the track: it plays from the cart under review and the track is decided, outside the
// selected store tab or removed from the cart. Starting such a track by clicking its row is not stepping, so it still
// plays.
export const isSkippedInReview = (track, cartReview, sourceKey) => {
  if (!isReviewing(cartReview) || sourceKey !== `cart:${cartReview.cartUuid}`) return false
  return (
    Boolean(reviewStateOf(track, cartReview)) ||
    !trackOnStore(track, cartReview.storeFocus) ||
    !inCart(track, cartReview.cartUuid)
  )
}

const COUNT_KEYS = { null: 'toReview', accepted: 'accepted', rejected: 'rejected' }

// The counts after one track moved from one state to another, until the server's counts arrive.
export const countsAfterDecision = (counts, from, to) => {
  if (!counts || (from ?? null) === (to ?? null)) return counts
  const fromKey = COUNT_KEYS[from ?? null]
  const toKey = COUNT_KEYS[to ?? null]
  return { ...counts, [fromKey]: Math.max(0, counts[fromKey] - 1), [toKey]: counts[toKey] + 1 }
}

// The number of accepted tracks per store, in the order stores first appear: `[{ store, count }]`.
export const acceptedStoreCounts = (acceptedLinks) => {
  const counts = new Map()
  for (const { links } of acceptedLinks || []) {
    for (const { store } of links) counts.set(store, (counts.get(store) || 0) + 1)
  }
  return [...counts].map(([store, count]) => ({ store, count }))
}

// For each accepted track, the link of the first included store that carries it (one tab per track). `skipped` counts
// the tracks on none of the included stores.
export const acceptedUrlsToOpen = (acceptedLinks, includedStores) => {
  const urls = []
  let skipped = 0
  for (const { links } of acceptedLinks || []) {
    const link = includedStores.map((store) => links.find((l) => l.store === store)).find(Boolean)
    if (link) urls.push(link.url)
    else skipped += 1
  }
  return { urls, skipped }
}

// Opens each url in a new tab and counts the ones the browser blocked. `window.open` with `noopener` always returns
// null, so the opener is cleared on the returned window instead.
export const openInNewTabs = (urls, open = (url) => window.open(url, '_blank')) => {
  let blocked = 0
  for (const url of urls) {
    const opened = open(url)
    if (!opened) blocked += 1
    else {
      try {
        opened.opener = null
      } catch (_e) {
        /* a cross-origin window may refuse the write */
      }
    }
  }
  return { opened: urls.length - blocked, blocked }
}

export const openAcceptedNotice = ({ blocked, skipped }) =>
  [
    blocked > 0 &&
      `Your browser blocked ${blocked} ${blocked === 1 ? 'tab' : 'tabs'}. Allow pop-ups for this site, then press Open accepted again.`,
    skipped > 0 && `${skipped} ${skipped === 1 ? 'track is' : 'tracks are'} on none of the chosen stores.`,
  ]
    .filter(Boolean)
    .join(' ')

const tracksText = (state, count) => `${count} ${state} ${count === 1 ? 'track' : 'tracks'}`

// The notice after the accepted or rejected tracks were removed or moved.
export const reviewedTracksNotice = (state, { count, targetCart }) =>
  targetCart
    ? `Moved ${tracksText(state, count)} to ${targetCart.name}.`
    : `Removed ${tracksText(state, count)} from this cart.`

export const swipeNotice = (state, title) => `${state === 'accepted' ? 'Accepted' : 'Rejected'} ${title}`

export const emptyReviewTabMessage = (reviewFilter) =>
  reviewFilter === 'to-review'
    ? 'Nothing left to review here. Open the accepted tracks, or deal with the rejected ones.'
    : 'No tracks here.'
