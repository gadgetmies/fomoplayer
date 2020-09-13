import config from './config.js'

const requestJSONwithCredentials = ({url, path, method = 'GET', body}) =>
  fetch(url ? url : `${config.apiUrl}${path}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  })

export default requestJSONwithCredentials
