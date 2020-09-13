import config from './config.js'

const requestJSONwithCredentials = (...args) =>
  requestWithCredentials(...args).then(async res => {
    return await res.json()
  })

const requestWithCredentials = async ({ url, path, method = 'GET', body }) => {
  const res = await fetch(url ? url : `${config.apiUrl}${path}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  })

  if (res.ok) {
    return res
  }
  else {
    console.error('Request failed', res)
    throw new Error('Request failed')
  }
}

export {
  requestJSONwithCredentials,
  requestWithCredentials
}
