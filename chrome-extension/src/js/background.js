import * as L from 'partial.lenses'
import * as R from 'ramda'
import { PLAYER_API_URL } from '../../utils/config.js'

chrome.runtime.onInstalled.addListener(function() {
  // Replace all rules ...
  chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
    // With a new rule ...
    chrome.declarativeContent.onPageChanged.addRules([
      {
        // That fires when a page's URL contains a 'g' ...
        conditions: [
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostEquals: 'www.google.com', schemes: ['https'] }
          })
        ],
        // And shows the extension's page action.
        actions: [new chrome.declarativeContent.ShowPageAction()]
      }
    ])
  })
})

const idToString = id => id.toString()

const durationLens = ['duration', L.multiply(1000)]
const bandcampReleasesTransform = L.collect([
  L.elems,
  L.choose(release => [
    'trackinfo',
    L.filter(R.prop('file')),
    L.elems,
    L.pick({
      id: 'id',
      title: 'title',
      artists: L.partsOf(
        L.pick({
          name: R.always(release.artist),
          role: R.always('author')
        })
      ),
      duration_ms: durationLens,
      release: R.always({
        release_date: new Date(release.album_release_date).toISOString(),
        url: release.url,
        title: release.current.title,
        id: release.id.toString(10)
      }),
      label: R.always({
        id: release.current.band_id.toString(10),
        url: release.url.substr(0, release.url.search(/[^/:]\//) + 1),
        name: release.url.match(/https:\/\/([^.]*)/)[1]
      }),
      previews: L.partsOf(
        L.pick({
          url: ['file', 'mp3-128'],
          format: R.always('mp3'),
          start_ms: R.always(0),
          end_ms: durationLens
        })
      ),
      store_details: []
    })
  ])
])

const beatportUrl = type => ({ id, slug }) => `https://www.beatport.com/${type}/${slug}/${id}`

const sharedArtistPropsLens = {
  name: 'name',
  id: ['id', L.reread(n => n.toString(10))],
  url: [L.props('slug', 'id'), L.reread(beatportUrl('artist'))]
}

const bpKeysToCamelot = {
  'C maj': '1d',
  'G maj': '2d',
  'D maj': '3d',
  'A maj': '4d',
  'E maj': '5d',
  'B maj': '6d',
  'F♯ maj': '7d',
  'G♭ maj': '7d',
  'C♯ maj': '8d',
  'D♭ maj': '8d',
  'G♯ maj': '9d',
  'A♭ maj': '9d',
  'D♯ maj': '10d',
  'E♭ maj': '10d',
  'A♯ maj': '11d',
  'B♭ maj': '11d',
  'F maj': '12d',
  'A min': '1m',
  'E min': '2m',
  'B min': '3m',
  'F♯ min': '4m',
  'G♭ min': '4m',
  'C♯ min': '5m',
  'D♭ min': '5m',
  'G♯ min': '6m',
  'A♭ min': '6m',
  'D♯ min': '7m',
  'E♭ min': '7m',
  'A♯ min': '8m',
  'B♭ min': '8m',
  'F min': '9m',
  'C min': '10m',
  'G min': '11m',
  'D min': '12m'
}

const beatportTracksTransform = L.collect([
  'tracks',
  L.elems,
  L.pick({
    title: [L.props('title', 'mix'), L.reread(({ title, mix }) => title.replace(` (${mix})`, ''))],
    version: 'mix',
    id: ['id', L.reread(idToString)],
    artists: L.partsOf(
      L.branch({
        artists: [
          L.elems,
          L.pick({
            ...sharedArtistPropsLens,
            role: R.always('author')
          })
        ],
        remixers: [
          L.elems,
          L.pick({
            ...sharedArtistPropsLens,
            role: R.always('remixer')
          })
        ]
      })
    ),
    genres: L.partsOf(['genres', L.elems, 'name']),
    duration_ms: ['duration', 'milliseconds'],
    release: [
      'release',
      L.pick({
        id: ['id', L.reread(idToString)],
        title: 'name',
        url: [L.props('slug', 'id'), L.reread(beatportUrl('release'))]
      })
    ],
    released: ['date', 'released'],
    published: ['date', 'published'],
    previews: L.partsOf([
      'preview',
      L.keyed,
      L.elems,
      L.pick({
        format: 0,
        url: [1, 'url'],
        start_ms: [1, 'offset', 'start'],
        end_ms: [1, 'offset', 'end']
      })
    ]),
    label: [
      'label',
      L.pick({
        id: ['id', L.reread(idToString)],
        name: 'name',
        url: [L.props('slug', 'id'), L.reread(beatportUrl('label'))]
      })
    ],
    waveform: ['waveform', 'large', L.props('url')],
    key: ['key', L.reread(bpKey => bpKeysToCamelot[bpKey])],
    store_details: []
  })
])

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

const sendBandcampItemsScript = (type, isLast) => `
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
  chrome.runtime.sendMessage({type: 'tracks', store: 'bandcamp', done: ${isLast}, data: JSON.parse(result.text)})
})
`

let bandcampTracksCache = []
let currentBandcampReleaseIndex = 0
let bandcampReleases = []
let bandcampTabId = undefined

const fetchInTab = isLast =>
  chrome.tabs.executeScript(bandcampTabId, {
    code: sendBandcampItemsScript('new', currentBandcampReleaseIndex === bandcampReleases.length - 1)
  })

const fetchNextItem = () => {
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

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === 'tracks') {
    if (message.store === 'beatport') {
      chrome.storage.local.get(['token'], ({ token }) => {
        console.log(message.data, beatportTracksTransform(message.data))
        const path = message.data.type === 'new' ? 'tracks' : 'downloaded'
        try {
          fetch(`${JSON.parse(PLAYER_API_URL)}/${path}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              authorization: `Bearer ${token}`,
              'x-multi-store-player-store': 'https://www.beatport.com'
            },
            body: JSON.stringify(beatportTracksTransform(message.data))
          })
        } catch (e) {
          console.error('Sending Beatport tracks failed', e)
        }

        chrome.runtime.sendMessage({ type: 'done' })
      })
    } else if (message.store === 'bandcamp') {
      if (message.data.tracks) {
        bandcampTracksCache.push(message.data.tracks)
      }
      if (message.done) {
        chrome.storage.local.get(['token'], async ({ token }) => {
          if (bandcampTabId !== undefined) {
            chrome.tabs.remove(bandcampTabId)
            bandcampTabId = undefined
          }
          let path = message.data.type === 'new' ? 'tracks' : 'downloaded'

          try {
            await fetch(`${PLAYER_API_URL}/${path}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                authorization: `Bearer ${token}`,
                'x-multi-store-player-store': 'https://bandcamp.com'
              },
              body: JSON.stringify(bandcampReleasesTransform(bandcampTracksCache))
            })
          } catch (e) {
            console.error('Sending Bandcamp tracks failed', e)
          }

          currentBandcampReleaseIndex = 0
          bandcampTracksCache = []
          bandcampReleases = []
          chrome.runtime.sendMessage({ type: 'done' })
        })
      } else {
        currentBandcampReleaseIndex++
        fetchNextItem()
      }
    }
  } else if (message.type === 'releases') {
    bandcampReleases = bandcampReleases.concat(message.data)
    if (currentBandcampReleaseIndex === 0) {
      fetchNextItem()
    }
  } else if (message.type === 'logging-out') {
    chrome.storage.local.set({ token: null }, () => {
      chrome.runtime.sendMessage({ type: 'logout' })
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
})
