import config from './config.js'

const searchParams = new URLSearchParams(window.location.search)
const storesFromHost = window.location.hostname.split('.').slice(0, -2)
const storesFromParams = searchParams.getAll('store')
let stores = [storesFromParams, storesFromHost, ['beatport', 'bandcamp']].find(ss => ss.length > 0)

const requestJSONwithCredentials = (...args) =>
  requestWithCredentials(...args).then(async (res) => {
    return await res.json()
  })

const requestWithCredentials = async ({ url: requestedUrl, path, method = 'GET', body, headers }) => {
  let url = new URL(requestedUrl ? requestedUrl : `${config.apiURL}${path}`)

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

export { requestJSONwithCredentials, requestWithCredentials }
