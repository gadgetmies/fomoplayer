import config from './config.js'

const requestJSONwithCredentials = (...args) =>
  requestWithCredentials(...args).then(async (res) => {
    return await res.json()
  })

const requestWithCredentials = async ({ url, path, method = 'GET', body, headers }) => {
  const res = await fetch(url ? url : `${config.apiURL}${path}`, {
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
