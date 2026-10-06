const spotifyInterceptor = require('fomoplayer_shared').interceptors.spotify.init()
const bandcampInterceptor = require('fomoplayer_shared').interceptors.bandcamp.init()

const { waitUntil, TimeoutError } = require('async-wait-until')
const R = require('ramda')

const { initDb } = require('../../../lib/db')
const assert = require('assert')
const dnbPlaylistUrl = 'https://bandcamp.com/discover/electronic?tags=drum-bass'
const dnbDigitalPlaylistUrl = 'https://bandcamp.com/discover/electronic/digital?tags=drum-bass'
const electronicPlaylistUrl = 'https://bandcamp.com/discover/electronic'
const electronicDigitalPlaylistUrl = 'https://bandcamp.com/discover/electronic/digital'
const allDigitalPlaylistUrl = 'https://bandcamp.com/discover/all/digital'
const {
  static: { getTagsFromUrl },
} = require('../../../../routes/stores/bandcamp/bandcamp-api.js')
const { addPlaylistFollows } = require('../../../../routes/users/logic')
const { test } = require('cascade-test')
const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

const deletePlaylist = async (followDetails) => {
  assert.equal(followDetails.length, 1)
  const match = followDetails[0].playlist.match(/.*\/(.*)$/)
  const playlistId = match[1]
  assert.ok(Number.isInteger(Number(playlistId)))
  await pg.queryAsync(sql`DELETE FROM playlist WHERE playlist_id = ${playlistId}`)
}

const addFollowTeardown = async (...args) => {
  await deletePlaylist(...args)
  bandcampInterceptor.clearMockedRequests()
}

const discoverApiUrl = 'https://bandcamp.com/api/discover/1/discover_web'
// The only release in the mocked discover results (fixtures/bandcamp-discover.json)
const discoveredReleaseUrl = 'https://noisia.bandcamp.com/album/the-resonance-vi'

// The follow fetches the playlist's tracks in the background and marks the
// playlist updated once they are all stored.
const waitUntilPlaylistUpdated = async ({ timeout = 8000 } = {}) => {
  const isUpdated = async () =>
    (await pg.queryRowsAsync(sql`SELECT 1 FROM playlist WHERE playlist_last_update IS NOT NULL`)).length === 1
  try {
    await waitUntil(isUpdated, { timeout, intervalBetweenAttempts: 100 })
  } catch (e) {
    if (e instanceof TimeoutError) {
      throw new Error(
        `Timeout (${timeout}ms) waiting for the playlist tracks to be stored, requests: ${JSON.stringify(
          bandcampInterceptor.getMockedRequests().map(R.prop('url')),
        )}`,
      )
    }
    throw e
  }
}

const assertPlaylistIsAddedCorrectly =
  (url, { tags, categoryId }) =>
  async () => {
    const details = await pg.queryRowsAsync(
      'SELECT playlist_store_id, store_playlist_type_label FROM playlist NATURAL JOIN store_playlist_type',
    )
    assert.deepEqual(details, [
      {
        playlist_store_id: url,
        store_playlist_type_label: 'Tag',
      },
    ])

    await waitUntilPlaylistUpdated()
    const requests = bandcampInterceptor.getMockedRequests()
    assert.deepEqual(requests.map(R.prop('url')), [discoverApiUrl, discoveredReleaseUrl])
    const { tag_norm_names, category_id } = JSON.parse(requests[0].body)
    assert.deepEqual({ tag_norm_names, category_id }, { tag_norm_names: tags, category_id: categoryId })
  }

const playlistFollowTest = (url, discoverParams) => ({
  setup: async () => {
    bandcampInterceptor.clearMockedRequests()
    return await addPlaylistFollows([{ url }], 1)
  },
  'are added correctly': assertPlaylistIsAddedCorrectly(url, discoverParams),
  teardown: addFollowTeardown,
})

test({
  setup: async () => {
    await initDb()
  },
  'playlist urls are parsed correctly': {
    'drum & bass playlist': () => {
      assert.deepEqual(getTagsFromUrl(dnbPlaylistUrl), {
        genre: 'electronic',
        subgenre: 'drum-bass',
        format: undefined,
      })
    },
    'digital drum & bass playlist': () => {
      assert.deepEqual(getTagsFromUrl(dnbDigitalPlaylistUrl), {
        genre: 'electronic',
        subgenre: 'drum-bass',
        format: 'digital',
      })
    },
    'electronic playlist': () => {
      assert.deepEqual(getTagsFromUrl(electronicPlaylistUrl), {
        genre: 'electronic',
        subgenre: undefined,
        format: undefined,
      })
    },
    'digital electronic playlist': () => {
      assert.deepEqual(getTagsFromUrl(electronicDigitalPlaylistUrl), {
        genre: 'electronic',
        format: 'digital',
        subgenre: undefined,
      })
    },
    'digital playlist': () => {
      assert.deepEqual(getTagsFromUrl(allDigitalPlaylistUrl), { format: 'digital', genre: 'all', subgenre: undefined })
    },
  },
  'when a user follows a Bandcamp playlist': {
    'genre follows': playlistFollowTest(electronicPlaylistUrl, { tags: ['electronic'], categoryId: 0 }),
    'subgenre follows': playlistFollowTest(dnbPlaylistUrl, { tags: ['electronic', 'drum-bass'], categoryId: 0 }),
    'subgenre format follows': playlistFollowTest(dnbDigitalPlaylistUrl, {
      tags: ['electronic', 'drum-bass'],
      categoryId: 1,
    }),
    'genre format follows': playlistFollowTest(electronicDigitalPlaylistUrl, { tags: ['electronic'], categoryId: 1 }),
    'format follows': playlistFollowTest(allDigitalPlaylistUrl, { tags: [], categoryId: 1 }),
  },
  teardown: async () => {
    spotifyInterceptor.dispose()
    bandcampInterceptor.dispose()
  },
})
