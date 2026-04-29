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
  if (activeInterceptors.has(name)) {
    logger.info(`Cleaning up existing interceptor for ${name}`)
    const existing = activeInterceptors.get(name)
    if (existing?.publicApi && typeof existing.publicApi.dispose === 'function') {
      existing.publicApi.dispose()
    }
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
