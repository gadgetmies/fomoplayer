const { BatchInterceptor } = require('@mswjs/interceptors')
const nodeInterceptors = require('@mswjs/interceptors/presets/node')
const R = require('ramda')
const logger = require('../logger')(__filename)

async function makeRequestAndRespond({ request, controller, url = undefined, options = {} }) {
  options = {
    method: request.method,
    duplex: request.duplex,
    ...options,
  }

  const res = await fetch(url || request.url, options)
  const body = await res.text()
  const headers = Object.fromEntries(res.headers)

  // Guard: only respond if the controller has not already handled this request
  if (controller.readyState !== 0) {
    logger.warn(`Request already handled, cannot respond again: ${request.url}`)
    return
  }

  return controller.respondWith(
    new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers: R.omit(['content-encoding'], headers), // TODO: should this be omitted for all cases or just Spotify?
    }),
  )
}

// Store active interceptors to prevent duplicates
const activeInterceptors = new Map()

module.exports.init = function init({ proxies, mocks, name, regex }) {
  // Remote-preview test runs (PREVIEW_URL set) drive a real deployed backend
  // and make real outbound HTTP from the test process (OIDC login, API seeding).
  // The msw passthrough path crashes on those, and there is nothing to mock
  // locally, so skip installing interceptors entirely in that mode.
  if (process.env.PREVIEW_URL) {
    logger.info(`Skipping ${name} interceptor: PREVIEW_URL is set (remote preview run).`)
    return { clearMockedRequests: () => {}, getMockedRequests: () => [], dispose: () => {} }
  }

  if (activeInterceptors.has(name)) {
    // Re-initialising for the same name returns the existing interceptor so all
    // callers share one instance (and its mockedRequests). Tests commonly call
    // init() and then import a route module that also calls init(); disposing
    // and recreating here orphaned the caller's earlier reference (its
    // mockedRequests stayed empty) and churned msw mid-flight, breaking
    // interception. Callers that want a fresh interceptor dispose() first.
    return activeInterceptors.get(name).publicApi
  }

  let mockedRequests = []

  logger.info(`Enabling development / test http request interceptors for ${name}`)

  // In v0.41, nodeInterceptors is a plain array (no .default wrapper).
  // It already includes FetchInterceptor — do not add another one.
  const interceptor = new BatchInterceptor({
    name: `${name}Interceptor`,
    interceptors: [...nodeInterceptors],
  })

  interceptor.apply()
  // Store the interceptor for cleanup
  const publicApi = {
    clearMockedRequests: () => {
      mockedRequests = []
    },
    getMockedRequests: () => {
      return mockedRequests
    },
    dispose: () => {
      logger.info(`Disposing interceptor for ${name}`)
      if (interceptor && typeof interceptor.dispose === 'function') {
        interceptor.dispose()
      }
      activeInterceptors.delete(name)
    },
  }

  activeInterceptors.set(name, { interceptor, publicApi })

  // In v0.41 the listener receives { request, requestId, controller }.
  // Responses must be issued via controller.respondWith() — request.respondWith() no longer exists.
  interceptor.on('request', async ({ request, requestId, controller }) => {
    const url = request.url
    logger.info(`Got request: ${url}`)

    const requestDetails = { url, pathname: new URL(url).pathname, request }

    if (url.match(regex) && (proxies || mocks)) {
      const proxy = proxies && proxies.find(({ test }) => test(requestDetails))
      const mock = mocks && mocks.find(({ test }) => test(requestDetails))

      if (proxy !== undefined) {
        const requestBody = request.body && (await request.clone().text())
        const rewrittenUrl = proxy.url(requestDetails)
        logger.info(`Proxying request from ${url} to ${rewrittenUrl}`)

        let headers = {}
        request.headers.forEach((value, key) => (headers[key] = value))

        try {
          const result = await makeRequestAndRespond({
            url: rewrittenUrl,
            options: {
              headers,
              body: requestBody,
            },
            request,
            controller,
          })
          return result
        } catch (error) {
          logger.error(`Failed to proxy request to ${rewrittenUrl}: ${error.message}`)
          throw error
        }
      } else if (mock !== undefined) {
        logger.info(`Mocking request: ${url}`)
        mockedRequests.push({ url, request })
        const { body, options } = mock.getResponse(requestDetails)

        try {
          const result = controller.respondWith(
            new Response(body instanceof Object ? JSON.stringify(body) : body, options),
          )
          return result
        } catch (error) {
          logger.error(`Failed to mock request ${url}: ${error.message}`)
          throw error
        }
      }
    }
  })

  return publicApi
}

// Global cleanup function to dispose all interceptors
module.exports.disposeAll = function disposeAll() {
  logger.info('Disposing all active interceptors')
  for (const [name, { interceptor }] of activeInterceptors) {
    if (interceptor && typeof interceptor.dispose === 'function') {
      interceptor.dispose()
    }
  }
  activeInterceptors.clear()
}
