export const events = {
  SEARCH: 'search',
}

export const subscribe = (eventName, listener) => {
  document.addEventListener(eventName, listener)
}

export const unsubscribe = (eventName, listener) => {
  document.removeEventListener(eventName, listener)
}

const publish = (eventName, data) => {
  const event = new CustomEvent(eventName, { detail: data })
  document.dispatchEvent(event)
}

export const search = (details) => {
  publish(events.SEARCH, details)
}
