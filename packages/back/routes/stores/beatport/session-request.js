/**
 * Replacement for request-in-session using Node.js built-in fetch and tough-cookie.
 * Provides the same session object interface as the original library.
 */
const { CookieJar, Cookie } = require('tough-cookie')

const initWithSession = function (cookieProperties, cookieUri, callback) {
  const cookieJar = new CookieJar()

  const keys = Object.keys(cookieProperties)
  keys.forEach((key) => cookieJar.setCookieSync(`${key}=${cookieProperties[key]}`, cookieUri))

  // Derive the CSRF key: any cookie key that is not the session key.
  // The session key is 'session'; everything else is treated as a CSRF/auth token.
  const csrfKey = keys.find((k) => k !== 'session') ?? ''

  return callback(null, createSessionRequestObject(cookieJar, cookieUri, csrfKey))
}

const init = function (cookieUri, loginUri, username, password, csrfTokenKey, sessionKey, callback) {
  const cookieJar = new CookieJar()

  const getHeaderCookies = (headers) => {
    const setCookie = headers.get('set-cookie')
    if (!setCookie) return []
    // fetch API merges set-cookie headers; split on comma+space before cookie name
    return setCookie.split(/,\s*(?=[a-zA-Z0-9_-]+=)/).map((c) => {
      try {
        return Cookie.parse(c)
      } catch {
        return null
      }
    }).filter(Boolean)
  }

  const storeCookies = async (response) => {
    const cookies = getHeaderCookies(response.headers)
    for (const cookie of cookies) {
      await cookieJar.setCookie(cookie, cookieUri)
    }
    return response
  }

  const getCookieValue = async (name) => {
    const cookies = await cookieJar.getCookies(cookieUri)
    const found = cookies.find((c) => c.key === name)
    return found ? found.value : undefined
  }

  const login = async () => {
    const loginPage = await fetch(loginUri, { headers: await buildCookieHeader(cookieJar, loginUri) })
    await storeCookies(loginPage)

    const csrfToken = await getCookieValue(csrfTokenKey)

    const body = new URLSearchParams({ [csrfTokenKey]: csrfToken, username, password })
    const loginResponse = await fetch(loginUri, {
      method: 'POST',
      headers: {
        Referer: loginUri,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(await buildCookieHeader(cookieJar, loginUri)),
      },
      body: body.toString(),
      redirect: 'manual',
    })
    await storeCookies(loginResponse)

    const sessionId = await getCookieValue(sessionKey)
    if (sessionId === undefined) {
      throw new Error('Login failed, please check credentials')
    }
  }

  login()
    .then(() => callback(null, createSessionRequestObject(cookieJar, cookieUri, csrfTokenKey)))
    .catch((err) => callback(err))
}

async function buildCookieHeader(cookieJar, uri) {
  const cookieString = await cookieJar.getCookieString(uri)
  return cookieString ? { Cookie: cookieString } : {}
}

function createSessionRequestObject(cookieJar, cookieUri, csrfTokenKey) {
  const get = async (uri) => {
    const res = await fetch(uri, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(await buildCookieHeader(cookieJar, uri)),
      },
    })
    return res
  }

  return {
    get: async (uri, callback) => {
      try {
        const res = await get(uri)
        const body = await res.text()
        return callback(null, body)
      } catch (e) {
        return callback(e)
      }
    },

    getJson: (uri, callback) => {
      return get(uri)
        .then((res) => res.json())
        .then((json) => callback(null, json))
        .catch((err) => callback(err))
    },

    getBlob: async (uri, callback) => {
      try {
        const res = await fetch(uri, {
          method: 'GET',
          headers: {
            Referer: cookieUri,
            ...(await buildCookieHeader(cookieJar, uri)),
          },
        })
        const buffer = Buffer.from(await res.arrayBuffer())
        callback(null, buffer)
      } catch (err) {
        callback(err)
      }
    },

    postJson: async (uri, json, callback) => {
      try {
        const cookies = await cookieJar.getCookies(cookieUri)
        const csrfToken = cookies.find((c) => c.key === csrfTokenKey)?.value
        const res = await fetch(uri, {
          method: 'POST',
          headers: {
            'X-CSRFToken': csrfToken,
            'X-Requested-With': 'XMLHttpRequest',
            Referer: cookieUri,
            'Content-Type': 'application/json',
            ...(await buildCookieHeader(cookieJar, uri)),
          },
          body: JSON.stringify(json),
        })
        const body = await res.json()
        callback(null, body)
      } catch (err) {
        callback(err)
      }
    },

    deleteJson: async (uri, json, callback) => {
      try {
        const cookies = await cookieJar.getCookies(cookieUri)
        const csrfToken = cookies.find((c) => c.key === csrfTokenKey)?.value
        const res = await fetch(uri, {
          method: 'DELETE',
          headers: {
            'X-CSRFToken': csrfToken,
            'X-Requested-With': 'XMLHttpRequest',
            Referer: cookieUri,
            'Content-Type': 'application/json',
            ...(await buildCookieHeader(cookieJar, uri)),
          },
          body: JSON.stringify(json),
        })
        const body = await res.json()
        callback(null, body)
      } catch (err) {
        callback(err)
      }
    },

    getCookieJar: () => cookieJar,
  }
}

module.exports = { init, initWithSession }
