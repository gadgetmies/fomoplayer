'use strict'

// Minimal in-memory `browser.storage.local` stub. The cart-push modules
// look up `browser` via `typeof browser !== 'undefined'` and fall back to
// `global.browser`; installing a stub on the global lets the modules pick
// it up without webpack / the `webextension-polyfill` runtime.

const installBrowserStub = () => {
  const store = new Map()
  global.browser = {
    storage: {
      local: {
        get: async (keys) => {
          const requested = Array.isArray(keys) ? keys : keys === undefined ? null : [keys]
          if (requested === null) {
            const out = {}
            for (const [k, v] of store.entries()) out[k] = v
            return out
          }
          const out = {}
          for (const k of requested) {
            if (store.has(k)) out[k] = store.get(k)
          }
          return out
        },
        set: async (obj) => {
          for (const [k, v] of Object.entries(obj)) store.set(k, v)
        },
        remove: async (keys) => {
          const ks = Array.isArray(keys) ? keys : [keys]
          for (const k of ks) store.delete(k)
        },
      },
    },
    tabs: {
      created: [],
      create: async ({ url, active }) => {
        const entry = { url, active }
        global.browser.tabs.created.push(entry)
        return { id: global.browser.tabs.created.length, url, active }
      },
    },
  }
  return { store }
}

const clearBrowserStub = () => {
  delete global.browser
}

const fetchMock = (handlers) => {
  const calls = []
  const fn = async (url, init = {}) => {
    calls.push({ url, init })
    const handler = handlers.find((h) => h.match(url, init))
    if (!handler) {
      throw new Error(`fetchMock: no handler matched ${url}`)
    }
    const r = await handler.respond(url, init)
    const status = r.status || (r.ok === false ? 500 : 200)
    const ok = r.ok !== undefined ? r.ok : status >= 200 && status < 300
    const contentType = r.contentType || 'application/json'
    const bodyText = typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {})
    return {
      ok,
      status,
      headers: {
        get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null),
      },
      text: async () => bodyText,
      json: async () => JSON.parse(bodyText),
    }
  }
  fn.calls = calls
  return fn
}

// Reset the `require` cache for cart-push modules so a freshly-stubbed
// `global.browser` is picked up on next require. Use after
// `installBrowserStub()` and before requiring `cart-push/*` from a test.
const reloadCartPushModules = () => {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/cart-push/') || key.endsWith('/browser.js')) {
      delete require.cache[key]
    }
  }
}

module.exports = {
  installBrowserStub,
  clearBrowserStub,
  fetchMock,
  reloadCartPushModules,
}
