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

const waitUntilEquals = async (fn, expected, { timeout = 5000 } = {}) => {
  try {
    await waitUntil(() => R.equals(fn(), expected), { timeout })
  } catch (e) {
    if (e instanceof TimeoutError) {
      throw new Error(
        `Timeout (${timeout}ms) waiting for value to equal: ${JSON.stringify(
          { expected, latest: await fn() },
          null,
          2,
        )}`,
      )
    } else {
      throw e
    }
  }
}

const waitUntilMockedRequestUrlsEqual = async (expected, { timeout = 4000 } = {}) =>
  waitUntilEquals(() => bandcampInterceptor.getMockedRequests().map(R.prop('url')), expected, { timeout })

// TODO: ensure updatePlaylistTracks is called when adding follows
const assertPlaylistIsAddedCorrectly = (url) => async () => {
  const details = await pg.queryRowsAsync(
    'SELECT playlist_store_id, store_playlist_type_label FROM playlist NATURAL JOIN store_playlist_type',
  )
  assert.deepEqual(details, [
    {
      playlist_store_id: url,
      store_playlist_type_label: 'Tag',
    },
  ])

  await waitUntilMockedRequestUrlsEqual([url])
}
const playlistFollowTest = (url) => ({
  setup: async () => {
    return await addPlaylistFollows([{ url }], 1)
  },
  'are added correctly': assertPlaylistIsAddedCorrectly(url),
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
    'genre follows': playlistFollowTest(electronicPlaylistUrl),
    'subgenre follows': playlistFollowTest(dnbPlaylistUrl),
    'subgenre format follows': playlistFollowTest(dnbDigitalPlaylistUrl),
    'genre format follows': playlistFollowTest(electronicDigitalPlaylistUrl),
    'format follows': playlistFollowTest(allDigitalPlaylistUrl),
  },
  teardown: async () => {
    spotifyInterceptor.dispose()
    bandcampInterceptor.dispose()
  }
})
