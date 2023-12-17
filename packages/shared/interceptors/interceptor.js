const { BatchInterceptor } = require('@mswjs/interceptors')
const { default: nodeInterceptors } = require('@mswjs/interceptors/presets/node')
const R = require('ramda')
const logger = require('../logger')(__filename)

async function makeRequestAndRespond({ originalRequest, url = undefined, options = {} }) {
  const clone = originalRequest.clone()
  options = {
    method: clone.method,
    duplex: clone.duplex,
    body: clone.body,
    headers: clone.headers,
    ...options
  }

  const res = await fetch(url || originalRequest.url, options)
  const body = await res.text()
  const headers = Object.fromEntries(res.headers)

  return originalRequest.respondWith(
    new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers: R.omit(['content-encoding'], headers) // TODO: should this be omitted for all cases or just Spotify?
    })
  )
}

module.exports.init = function init({ proxies, mocks, name, regex }) {
  let mockedRequests = []

  console.log(`Enabling development / test http request interceptors for ${name}`)
  const interceptor = new BatchInterceptor({
    name: `${name}Interceptor`,
    interceptors: nodeInterceptors
  })

  interceptor.apply()

  interceptor.on('request', async (...args) => {
    const { request } = args[0]
    const clone = request.clone()
    const requestDetails = { url: clone.url, pathname: new URL(clone.url).pathname, request: clone }

    if (clone.url.match(regex) && (proxies || mocks)) {
      const proxy = proxies.find(({ test }) => test(requestDetails))
      const mock = mocks.find(({ test }) => test(requestDetails))
      if (proxy !== undefined) {
        const requestBody = await clone.text()
        const rewrittenUrl = proxy.url(requestDetails)
        logger.info(`Proxying request from ${clone.url} to ${rewrittenUrl}`)

        return makeRequestAndRespond({
          originalRequest: request,
          url: rewrittenUrl,
          options: {
            headers: {
              authorization: clone.headers.get('authorization')
            },
            body: requestBody
          },
          request
        })
      } else if (mock !== undefined) {
        console.log('Mocking request', clone.url)
        mockedRequests.push({ url: clone.url, request: clone })
        const pathname = new URL(clone.url).pathname
        const { body, options } = mock.getResponse({ url: clone.url, pathname, request: clone })
        return request.respondWith(new Response(body instanceof Object ? JSON.stringify(body) : body, options))
      } else {
        throw new Error(`No proxy or mock found for ${clone.url}`)
      }
    }
    console.log(`Returning request without modifications for url: ${clone.url} from ${name} interceptor`)
  })

  function clearMockedRequests() {
    mockedRequests = []
  }

  function getMockedRequests() {
    return mockedRequests
  }

  return {
    clearMockedRequests,
    getMockedRequests
  }
}
