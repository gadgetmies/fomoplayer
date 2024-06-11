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

  return request.respondWith(
    new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers: R.omit(['content-encoding'], headers), // TODO: should this be omitted for all cases or just Spotify?
    }),
  )
}

module.exports.init = function init({ proxies, mocks, name, regex }) {
  let mockedRequests = []

  logger.info(`Enabling development / test http request interceptors for ${name}`)
  const interceptor = new BatchInterceptor({
    name: `${name}Interceptor`,
    interceptors: nodeInterceptors,
  })

  interceptor.apply()

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

        return makeRequestAndRespond({
          url: rewrittenUrl,
          options: {
            headers,
            body: requestBody,
          },
          request,
        })
      } else if (mock !== undefined) {
        logger.info(`Mocking request: ${url}`)
        mockedRequests.push({ url, request })
        const pathname = new URL(url).pathname
        const { body, options } = mock.getResponse({ url, pathname, request })
        return request.respondWith(new Response(body instanceof Object ? JSON.stringify(body) : body, options))
      }
    }
  })

  function clearMockedRequests() {
    mockedRequests = []
  }

  function getMockedRequests() {
    return mockedRequests
  }

  return {
    clearMockedRequests,
    getMockedRequests,
  }
}
