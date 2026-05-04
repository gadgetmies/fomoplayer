// Per-tab counter of in-flight `bandcamp:enqueue` requests. The Queue
// buttons in inject.js bump it around each request; player-ui.js subscribes
// to render an "Adding…" row at the tail of the queue list while any are
// pending. Lives in the content-script bundle, so it's shared across both
// modules but isolated per tab — which is the scope of the embedded player
// UI it feeds.

let count = 0
const subscribers = new Set()

const notify = () => {
  for (const fn of subscribers) {
    try {
      fn(count)
    } catch (e) {
      console.warn('pending-adds subscriber threw', e)
    }
  }
}

export const incrementPendingAdds = () => {
  count += 1
  notify()
}

export const decrementPendingAdds = () => {
  if (count > 0) count -= 1
  notify()
}

export const getPendingAdds = () => count

export const subscribePendingAdds = (fn) => {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}
