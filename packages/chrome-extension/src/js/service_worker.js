import { bandcampReleasesTransform } from './transforms/bandcamp'
import { beatportTracksTransform, beatportLibraryTransform } from './transforms/beatport'
import * as R from 'ramda'

const ACCESS_TOKEN_REFRESH_LEEWAY_SECONDS = 30

const chromeStorageGet = (area, keys) =>
  new Promise((resolve) => {
    area.get(keys, resolve)
  })

const chromeStorageSet = (area, values) =>
  new Promise((resolve) => {
    area.set(values, resolve)
  })

const chromeStorageRemove = (area, keys) =>
  new Promise((resolve) => {
    area.remove(keys, resolve)
  })

const sessionAreaAvailable = () =>
  Boolean(chrome.storage && chrome.storage.session && typeof chrome.storage.session.get === 'function')

const accessArea = () => (sessionAreaAvailable() ? chrome.storage.session : chrome.storage.local)
const refreshArea = () => chrome.storage.local

const base64UrlEncode = (bytes) => {
  let str = ''
  for (let i = 0; i < bytes.length; i += 1) str += String.fromCharCode(bytes[i])
  return btoa(str).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

const sha256Base64Url = async (input) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return base64UrlEncode(new Uint8Array(digest))
}

const randomUrlSafe = (byteLength) => {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

const launchWebAuthFlow = (url) =>
  new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (redirectedTo) => {
      if (chrome.runtime.lastError || !redirectedTo) {
        return reject(new Error(chrome.runtime.lastError?.message || 'Login window closed'))
      }
      resolve(redirectedTo)
    })
  })

const startExtensionLogin = async (appUrl) => {
  const codeVerifier = randomUrlSafe(32)
  const codeChallenge = await sha256Base64Url(codeVerifier)
  const state = randomUrlSafe(16)
  const extensionId = chrome.runtime.id

  const startUrl = new URL(`${appUrl}/api/auth/login/extension`)
  startUrl.searchParams.set('extensionId', extensionId)
  startUrl.searchParams.set('code_challenge', codeChallenge)
  startUrl.searchParams.set('code_challenge_method', 'S256')
  startUrl.searchParams.set('state', state)

  const redirectedTo = await launchWebAuthFlow(startUrl.toString())
  const redirectUrl = new URL(redirectedTo)
  const code = redirectUrl.searchParams.get('code')
  const returnedState = redirectUrl.searchParams.get('state')
  if (!code || !returnedState) throw new Error('Login response missing code or state')
  if (returnedState !== state) throw new Error('State mismatch — possible CSRF')

  const tokenResponse = await fetch(`${appUrl}/api/auth/extension/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: codeVerifier, extensionId }),
  })
  if (!tokenResponse.ok) {
    const message = await tokenResponse.text()
    throw new Error(`Extension token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText} ${message}`)
  }
  return await tokenResponse.json()
}

const refreshAccessToken = async (appUrl, refreshToken) => {
  const response = await fetch(`${appUrl}/api/auth/extension/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Refresh failed: ${response.status} ${response.statusText} ${message}`)
  }
  return await response.json()
}

const persistTokens = async ({ access_token, refresh_token, expires_in }) => {
  const expiresAt = Date.now() + Math.max((expires_in - ACCESS_TOKEN_REFRESH_LEEWAY_SECONDS) * 1000, 1000)
  await chromeStorageSet(accessArea(), { accessToken: access_token, accessTokenExpiresAt: expiresAt })
  await chromeStorageSet(refreshArea(), { refreshToken: refresh_token })
}

const clearTokens = async () => {
  await chromeStorageRemove(accessArea(), ['accessToken', 'accessTokenExpiresAt'])
  await chromeStorageRemove(refreshArea(), ['refreshToken', 'token', 'tokenExpiresAt', 'googleIdToken'])
}

const resolveAccessToken = async (appUrl) => {
  const { accessToken, accessTokenExpiresAt } = await chromeStorageGet(accessArea(), [
    'accessToken',
    'accessTokenExpiresAt',
  ])
  if (accessToken && accessTokenExpiresAt && accessTokenExpiresAt > Date.now()) {
    return accessToken
  }

  const { refreshToken } = await chromeStorageGet(refreshArea(), ['refreshToken'])
  if (!refreshToken) return null

  try {
    const tokens = await refreshAccessToken(appUrl, refreshToken)
    await persistTokens(tokens)
    return tokens.access_token
  } catch (e) {
    console.log('Token refresh failed; clearing stored credentials', e)
    await clearTokens()
    return null
  }
}

const waitFunction = `
var wait = (test, success) => {
  var result = test()
  if (!result) {
    setTimeout(() => wait(test, success), 100)
  } else {
    success(result)
  }
}
`

const sendBandcampItemsScript = (type) => `
${waitFunction}

var script = document.createElement('script')
script.id = 'test'
script.text = \`
  ${waitFunction}

  wait(() => window.TralbumData, playables => {
    var script = document.getElementById('playables') || document.createElement('script')
    script.type = 'text/plain'
    script.id = 'playables'
    script.text = JSON.stringify({type: '${type}', tracks: playables})
    document.documentElement.appendChild(script)
  })
\`

document.documentElement.appendChild(script)

wait(() => document.getElementById('playables'), (result) => {
  chrome.runtime.sendMessage({type: 'tracks', store: 'bandcamp', data: JSON.parse(result.text)})
})
`

let bandcampTracksCache = []
let currentBandcampReleaseIndex = 0
let bandcampReleases = []
let bandcampTabId = undefined

let beatportTracksCache = []

const fetchInTab = () => {}
// TODO
// chrome.tabs.executeScript(bandcampTabId, {
//   code: sendBandcampItemsScript('tracks'),
// })

const clearStatus = () => {
  chrome.storage.local.set(
    {
      operationStatus: '',
      operationProgress: 0,
    },
    () => {
      chrome.runtime.sendMessage({ type: 'done' })
    },
  )
}

const fetchNextItem = () => {
  chrome.storage.local.set(
    {
      operationStatus: 'Fetcing tracks',
      operationProgress: parseInt((currentBandcampReleaseIndex / bandcampReleases.length) * 100),
    },
    () => {
      chrome.runtime.sendMessage({ type: 'refresh' })
    },
  )

  const itemUrl = bandcampReleases[currentBandcampReleaseIndex].item_url
  if (bandcampTabId !== undefined) {
    chrome.tabs.remove(bandcampTabId)
    bandcampTabId = undefined
  }
  chrome.tabs.create({ url: itemUrl, active: false }, (tab) => {
    bandcampTabId = tab.id
    fetchInTab()
  })
}

const handleError = (error) => {
  clearStatus()
  chrome.storage.local.set({ error })
  chrome.runtime.sendMessage({ type: 'error', ...error })
}

const sendTracks = (storeUrl, type = 'tracks', tracks) => {
  chrome.storage.local.get(['appUrl'], async ({ appUrl }) => {
    const base = appUrl || DEFAULT_APP_URL
    try {
      const accessToken = await resolveAccessToken(base)
      if (!accessToken) {
        throw new Error('Not authenticated. Please log in again.')
      }

      const chunks = R.splitEvery(100, tracks)
      const chunkIndexes = R.range(0, chunks.length)

      for (const i of chunkIndexes) {
        chrome.storage.local.set({
          operationStatus: `Sending tracks`,
          operationProgress: parseInt((i / chunks.length) * 100),
        })
        chrome.runtime.sendMessage({ type: 'refresh' })

        const res = await fetch(`${base}/api/me/${type}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${accessToken}`,
            'x-multi-store-player-store': storeUrl,
          },
          body: JSON.stringify(chunks[i]),
        })

        if (!res.ok) {
          const status = await res.text()
          throw new Error(`Response not ok, status: ${res.status} ${res.statusText} ${status}`)
        }
      }
      clearStatus()
    } catch (e) {
      const message = {
        message: `Failed to send tracks from ${storeUrl}`,
        stack: JSON.stringify({
          url: `${base}/api/me/${type}`,
          storeUrl,
          stack: e.stack,
          time: new Date().toUTCString(),
        }),
      }
      handleError(message)
    }
  })
}

const sendArtists = (storeUrl, artists) => {
  chrome.storage.local.get(['appUrl'], async ({ appUrl }) => {
    const base = appUrl || DEFAULT_APP_URL
    try {
      const accessToken = await resolveAccessToken(base)
      if (!accessToken) {
        throw new Error('Not authenticated. Please log in again.')
      }

      chrome.storage.local.set({
        operationStatus: `Sending artists`,
        operationProgress: 0,
      })
      chrome.runtime.sendMessage({ type: 'refresh' })

      const res = await fetch(`${base}/api/me/follows/artists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${accessToken}`,
          'x-multi-store-player-store': storeUrl,
        },
        body: JSON.stringify(artists),
      })

      if (!res.ok) {
        const status = await res.text()
        throw new Error(`Response not ok, status: ${res.status} ${res.statusText} ${status}`)
      }
      clearStatus()
    } catch (e) {
      const message = {
        message: `Failed to send artists from ${storeUrl}`,
        stack: JSON.stringify({
          url: `${base}/api/me/follows/artists`,
          storeUrl,
          stack: e.stack,
          time: new Date().toUTCString(),
        }),
      }
      handleError(message)
    }
  })
}

const sendLabels = (storeUrl, labels) => {
  chrome.storage.local.get(['appUrl'], async ({ appUrl }) => {
    const base = appUrl || DEFAULT_APP_URL
    try {
      const accessToken = await resolveAccessToken(base)
      if (!accessToken) {
        throw new Error('Not authenticated. Please log in again.')
      }

      chrome.storage.local.set({
        operationStatus: `Sending labels`,
        operationProgress: 0,
      })
      chrome.runtime.sendMessage({ type: 'refresh' })

      const res = await fetch(`${base}/api/me/follows/labels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${accessToken}`,
          'x-multi-store-player-store': storeUrl,
        },
        body: JSON.stringify(labels),
      })

      if (!res.ok) {
        const status = await res.text()
        throw new Error(`Response not ok, status: ${res.status} ${res.statusText} ${status}`)
      }
      clearStatus()
    } catch (e) {
      const message = {
        message: `Failed to send labels from ${storeUrl}`,
        stack: JSON.stringify({
          url: `${base}/api/me/follows/labels`,
          storeUrl,
          stack: e.stack,
          time: new Date().toUTCString(),
        }),
      }
      handleError(message)
    }
  })
}

console.log('registering')
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.log('message', message)
  if (message.type === 'operationStatus') {
    chrome.storage.local.set({ operationStatus: message.text, operationProgress: message.progress })
    chrome.runtime.sendMessage({ type: 'refresh' })
    return false
  } else if (message.type === 'clearError') {
    clearStatus()
    chrome.storage.local.remove('error')
    chrome.runtime.sendMessage({ type: 'refresh' })
  } else if (message.type === 'error') {
    handleError(message)
  } else if (message.type === 'artists') {
    sendArtists('https://www.beatport.com', message.data)
  } else if (message.type === 'labels') {
    sendLabels('https://www.beatport.com', message.data)
  } else if (message.type === 'purchased') {
    console.log('purchased foo')
    if (message.store === 'beatport') {
      console.log('beatport', { message, foo: 'bar' })
      const transformed = beatportLibraryTransform(message.data)
      console.log({ transformed })
      sendTracks('https://www.beatport.com', 'purchased', transformed)
    }
  } else if (message.type === 'tracks') {
    if (message.store === 'beatport') {
      beatportTracksCache = beatportTracksCache.concat(message.data.tracks)
      if (message.done) {
        sendTracks('https://www.beatport.com', message.data.type, beatportTracksTransform(beatportTracksCache))
        beatportTracksCache = []
      }
    } else if (message.store === 'bandcamp') {
      if (message.data.tracks) {
        bandcampTracksCache.push(message.data.tracks)
      }
      if (message.done || currentBandcampReleaseIndex === bandcampReleases.length - 1) {
        if (bandcampTabId !== undefined) {
          chrome.tabs.remove(bandcampTabId)
          bandcampTabId = undefined
        }

        sendTracks('https://bandcamp.com', message.data.type, bandcampReleasesTransform(bandcampTracksCache))
        currentBandcampReleaseIndex = 0
        bandcampTracksCache = []
        bandcampReleases = []
      } else {
        currentBandcampReleaseIndex++
        fetchNextItem()
      }
    }
  } else if (message.type === 'releases') {
    bandcampReleases = bandcampReleases.concat(message.data)
    if (message.done) {
      fetchNextItem()
    }
  } else if (message.type === 'logging-out') {
    chrome.storage.local.get(['appUrl'], async ({ appUrl }) => {
      const base = appUrl || DEFAULT_APP_URL
      const { refreshToken } = await chromeStorageGet(refreshArea(), ['refreshToken'])
      if (refreshToken) {
        try {
          await fetch(`${base}/api/auth/extension/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          })
        } catch (e) {
          console.log('Logout request failed; clearing local credentials anyway', e)
        }
      }
      await clearTokens()
      chrome.runtime.sendMessage({ type: 'refresh' })
    })
  } else if (message.type === 'oauth-login') {
    chrome.storage.local.get(['appUrl'], async ({ appUrl }) => {
      const base = appUrl || DEFAULT_APP_URL
      try {
        const tokens = await startExtensionLogin(base)
        await persistTokens(tokens)
        console.log('Extension login successful')
        chrome.runtime.sendMessage({ type: 'login', success: true })
      } catch (e) {
        console.log('Extension login failed', e)
        chrome.runtime.sendMessage({ type: 'login', success: false })
      }
    })
  }

  return false
})

console.log('registered')

chrome.storage.local.get(['enabledStores', 'appUrl'], ({ appUrl, enabledStores }) => {
  chrome.storage.local.set({
    enabledStores: enabledStores ? enabledStores : { beatport: true, bandcamp: true },
    appUrl: appUrl ? appUrl : DEFAULT_APP_URL,
  })
})
