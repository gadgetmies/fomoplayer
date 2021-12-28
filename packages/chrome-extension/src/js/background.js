import { bandcampReleasesTransform } from './transforms/bandcamp'
import { beatportTracksTransform, beatportLibraryTransform } from './transforms/beatport'
import * as R from 'ramda'

const fetchGoogleToken = handler => {
  var manifest = chrome.runtime.getManifest()

  var clientId = encodeURIComponent(manifest.oauth2.client_id)
  var scopes = encodeURIComponent(['profile', 'openid'].join(' '))
  var redirectUri = encodeURIComponent('https://' + chrome.runtime.id + '.chromiumapp.org')

  var url =
    'https://accounts.google.com/o/oauth2/auth' +
    '?client_id=' +
    clientId +
    '&response_type=id_token' +
    '&access_type=offline' +
    '&redirect_uri=' +
    redirectUri +
    '&scope=' +
    scopes

  chrome.identity.launchWebAuthFlow(
    {
      url: url,
      interactive: true
    },
    async function(redirectedTo) {
      let token = null
      if (chrome.runtime.lastError) {
        // Example: Authorization page could not be loaded.
        console.log(chrome.runtime.lastError.message)
      } else {
        const params = new URLSearchParams(redirectedTo.split('#', 2)[1])
        token = params.get('id_token')
        // Example: id_token=<YOUR_BELOVED_ID_TOKEN>&authuser=0&hd=<SOME.DOMAIN.PL>&session_state=<SESSION_SATE>&prompt=<PROMPT>
      }
      chrome.storage.local.set({ token }, () => {
        handler(!!token)
      })
    }
  )
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

const sendBandcampItemsScript = type => `
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

const fetchInTab = () =>
  chrome.tabs.executeScript(bandcampTabId, {
    code: sendBandcampItemsScript('tracks')
  })

const clearStatus = () => {
  chrome.storage.local.set(
    {
      operationStatus: '',
      operationProgress: 0
    },
    () => {
      chrome.runtime.sendMessage({ type: 'done' })
    }
  )
}

const fetchNextItem = () => {
  chrome.storage.local.set(
    {
      operationStatus: 'Fetcing tracks',
      operationProgress: parseInt((currentBandcampReleaseIndex / bandcampReleases.length) * 100)
    },
    () => {
      chrome.runtime.sendMessage({ type: 'refresh' })
    }
  )

  const itemUrl = bandcampReleases[currentBandcampReleaseIndex].item_url
  if (bandcampTabId !== undefined) {
    chrome.tabs.remove(bandcampTabId)
    bandcampTabId = undefined
  }
  chrome.tabs.create({ url: itemUrl, active: false }, tab => {
    bandcampTabId = tab.id
    fetchInTab()
  })
}

const handleError = error => {
  clearStatus()
  chrome.storage.local.set({ error })
  chrome.runtime.sendMessage({ type: 'error', ...error })
}

const sendTracks = (storeUrl, type = 'tracks', tracks) => {
  chrome.storage.local.get(['token', 'appUrl'], async ({ token, appUrl }) => {
    try {
      const chunks = R.splitEvery(100, tracks)
      const chunkIndexes = R.range(0, chunks.length)

      for (const i of chunkIndexes) {
        chrome.storage.local.set({
          operationStatus: `Sending tracks`,
          operationProgress: parseInt((i / chunks.length) * 100)
        })
        chrome.runtime.sendMessage({ type: 'refresh' })

        const res = await fetch(`${appUrl}/api/me/${type}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${token}`,
            'x-multi-store-player-store': storeUrl
          },
          body: JSON.stringify(chunks[i])
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
          url: `${appUrl}/api/me/${type}`,
          storeUrl,
          stack: e.stack,
          time: new Date().toUTCString()
        })
      }
      handleError(message)
    }
  })
}

const sendArtists = (storeUrl, artists) => {
  chrome.storage.local.get(['token', 'appUrl'], async ({ token, appUrl }) => {
    try {
      chrome.storage.local.set({
        operationStatus: `Sending artists`,
        operationProgress: 0
      })
      chrome.runtime.sendMessage({ type: 'refresh' })

      const res = await fetch(`${appUrl}/api/me/follows/artists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
          'x-multi-store-player-store': storeUrl
        },
        body: JSON.stringify(artists)
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
          url: `${appUrl}/api/me/follows/artists`,
          storeUrl,
          stack: e.stack,
          time: new Date().toUTCString()
        })
      }
      handleError(message)
    }
  })
}

const sendLabels = (storeUrl, labels) => {
  chrome.storage.local.get(['token', 'appUrl'], async ({ token, appUrl }) => {
    try {
      chrome.storage.local.set({
        operationStatus: `Sending labels`,
        operationProgress: 0
      })
      chrome.runtime.sendMessage({ type: 'refresh' })

      const res = await fetch(`${appUrl}/api/me/follows/labels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
          'x-multi-store-player-store': storeUrl
        },
        body: JSON.stringify(labels)
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
          url: `${appUrl}/api/me/follows/labels`,
          storeUrl,
          stack: e.stack,
          time: new Date().toUTCString()
        })
      }
      handleError(message)
    }
  })
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === 'operationStatus') {
    chrome.storage.local.set({ operationStatus: message.text, operationProgress: message.progress })
    chrome.runtime.sendMessage({ type: 'refresh' })
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
    if (message.store === 'beatport') {
      sendTracks('https://www.beatport.com', 'purchased', beatportLibraryTransform(message.data))
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
    chrome.storage.local.remove('token', () => {
      chrome.runtime.sendMessage({ type: 'refresh' })
    })
  } else if (message.type === 'oauth-login') {
    fetchGoogleToken(success => {
      if (success) {
        console.log('Got token from Google')
      } else {
        console.log('Did not get token from Google')
      }
      chrome.runtime.sendMessage({ type: 'login', success })
    })
  }

  return true
})

chrome.storage.local.get(['enabledStores', 'appUrl'], ({ appUrl, enabledStores }) => {
  chrome.storage.local.set({
    enabledStores: enabledStores ? enabledStores : { beatport: true, bandcamp: true },
    appUrl: appUrl ? appUrl : 'https://fomoplayer.com'
  })
})
