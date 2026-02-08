const { BatchInterceptor } = require('@mswjs/interceptors')
const { default: nodeInterceptors } = require('@mswjs/interceptors/presets/node')
const R = require('ramda')
const logger = require('../logger')(__filename)

async function makeRequestAndRespond({ request, url = undefined, options = {} }) {
  options = {
    method: request.method,
    duplex: request.duplex,
    ...options,
  }

  const res = await fetch(url || request.url, options)
  const body = await res.text()
  const headers = Object.fromEntries(res.headers)

  // Check if request has already been responded to before responding
  if (request.responded || request._responded) {
    logger.warn(`Request already responded, cannot respond again: ${request.url}`)
    return
  }

  return request.respondWith(
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
  let mockedRequests = []

  // Check if interceptor already exists and clean it up
  if (activeInterceptors.has(name)) {
    logger.info(`Cleaning up existing interceptor for ${name}`)
    const existingInterceptor = activeInterceptors.get(name)
    if (existingInterceptor && typeof existingInterceptor.dispose === 'function') {
      existingInterceptor.dispose()
    }
  }

  logger.info(`Enabling development / test http request interceptors for ${name}`)
  const interceptor = new BatchInterceptor({
    name: `${name}Interceptor`,
    interceptors: nodeInterceptors,
  })

  interceptor.apply()

  // Store the interceptor for cleanup
  activeInterceptors.set(name, interceptor)

  interceptor.on('request', async (...args) => {
    const { request } = args[0]
    const url = request.url
    logger.info(`Got request: ${url}`)

    const requestDetails = { url, pathname: new URL(url).pathname, request }

    if (url.match(regex) && (proxies || mocks)) {
      const proxy = proxies.find(({ test }) => test(requestDetails))
      const mock = mocks.find(({ test }) => test(requestDetails))
      
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
          })
          return result
        } catch (error) {
          logger.error(`Failed to proxy request to ${rewrittenUrl}: ${error.message}`)
          throw error
        }
      } else if (mock !== undefined) {
        logger.info(`Mocking request: ${url}`)
        mockedRequests.push({ url, request })
        const pathname = new URL(url).pathname
        const { body, options } = mock.getResponse({ url, pathname, request })
        
        try {
          const result = request.respondWith(new Response(body instanceof Object ? JSON.stringify(body) : body, options))
          return result
        } catch (error) {
          logger.error(`Failed to mock request ${url}: ${error.message}`)
          throw error
        }
      }
    }
  })

  function clearMockedRequests() {
    mockedRequests = []
  }

  function getMockedRequests() {
    return mockedRequests
  }

  function dispose() {
    logger.info(`Disposing interceptor for ${name}`)
    if (interceptor && typeof interceptor.dispose === 'function') {
      interceptor.dispose()
    }
    activeInterceptors.delete(name)
  }

  return {
    clearMockedRequests,
    getMockedRequests,
    dispose,
  }
}

// Global cleanup function to dispose all interceptors
module.exports.disposeAll = function disposeAll() {
  logger.info('Disposing all active interceptors')
  for (const [name, interceptor] of activeInterceptors) {
    if (interceptor && typeof interceptor.dispose === 'function') {
      interceptor.dispose()
    }
  }
  activeInterceptors.clear()
}
