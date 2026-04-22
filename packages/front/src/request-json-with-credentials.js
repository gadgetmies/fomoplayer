import config from './config.js'

const defaultStores = ['beatport', 'bandcamp']

const resolveStoresForRequest = ({ search, hostname, isPreviewEnv }) => {
  const searchParams = new URLSearchParams(search)
  const storesFromParams = searchParams.getAll('store')
  const storesFromHost = isPreviewEnv ? [] : hostname.split('.').slice(0, -2)
  return [storesFromParams, storesFromHost, defaultStores].find((storeNames) => storeNames.length > 0)
}

const stores = resolveStoresForRequest({
  search: window.location.search,
  hostname: window.location.hostname,
  isPreviewEnv: config.isPreviewEnv,
})

const requestJSONwithCredentials = (...args) =>
  requestWithCredentials(...args).then(async (res) => {
    return await res.json()
  })

const resolveRequestUrl = (value) => {
  try {
    return new URL(value)
  } catch (e) {
    const origin = window?.location?.origin || 'http://localhost'
    return new URL(value, origin)
  }
}

const requestWithCredentials = async ({ url: requestedUrl, path, method = 'GET', body, headers }) => {
  const resolvedUrl = requestedUrl ? requestedUrl : `${config.apiURL}${path}`
  let url = new URL(resolvedUrl, window.location.origin)

  if (stores) {
    const urlSearchParams = new URLSearchParams(url.search)
    stores.forEach((s) => urlSearchParams.append('store', s))
    url.search = urlSearchParams.toString()
  }

  const res = await fetch(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...headers,
    },
  })

  if (res.ok) {
    return res
  } else {
    console.error('Request failed', res)
    const error = new Error('Request failed')
    error.response = res
    throw error
  }
}

export { requestJSONwithCredentials, requestWithCredentials, resolveStoresForRequest }
