const assert = require('assert')
const { test } = require('cascade-test')

const { parsePlaylistUrl } = require('../../../routes/stores/beatport/bp-api')
const { searchGenres, genreTop100Url, genreById } = require('../../../routes/stores/beatport/genres')

test({
  'genre top-100 URL resolves to the genre kind + id': async () => {
    assert.deepEqual(parsePlaylistUrl('https://www.beatport.com/genre/uk-garage-bassline/86/top-100'), {
      kind: 'genre-top',
      id: '86',
    })
  },
  'bare genre URL (pre-migration) still resolves to a genre top-100': async () => {
    assert.deepEqual(parsePlaylistUrl('https://www.beatport.com/genre/uk-garage-bassline/86'), {
      kind: 'genre-top',
      id: '86',
    })
  },
  'overall top-100 resolves to the top kind': async () => {
    assert.deepEqual(parsePlaylistUrl('https://www.beatport.com/top-100'), { kind: 'top' })
  },
  'playlist URLs still resolve': async () => {
    assert.deepEqual(parsePlaylistUrl('https://www.beatport.com/playlist/mine/999'), {
      kind: 'playlist',
      id: '999',
    })
  },
  'chart URLs no longer resolve as followable playlists': async () => {
    assert.equal(parsePlaylistUrl('https://www.beatport.com/chart/some-chart/12345'), null)
  },
  'unrelated beatport URLs do not resolve as playlists': async () => {
    assert.equal(parsePlaylistUrl('https://www.beatport.com/artist/noisia/12'), null)
  },
  'genre search matches on name and slug': async () => {
    const ids = searchGenres('uk garage').map((genre) => genre.id)
    assert.ok(ids.includes(86), 'expected UK Garage / Bassline (86) to match "uk garage"')
    const slugIds = searchGenres('tech-house').map((genre) => genre.id)
    assert.ok(slugIds.includes(11), 'expected Tech House (11) to match slug "tech-house"')
  },
  'genre top-100 URL round-trips back to its id': async () => {
    const url = genreTop100Url(genreById(86))
    assert.equal(url, 'https://www.beatport.com/genre/uk-garage-bassline/86/top-100')
    assert.deepEqual(parsePlaylistUrl(url), { kind: 'genre-top', id: '86' })
  },
  'genre 95 (140 / Deep Dubstep / Grime) is in the cache': async () => {
    assert.deepEqual(genreById(95), { id: 95, name: '140 / Deep Dubstep / Grime', slug: '140-deep-dubstep-grime' })
    assert.equal(genreTop100Url(genreById(95)), 'https://www.beatport.com/genre/140-deep-dubstep-grime/95/top-100')
  },
  'genre ids match Beatport (Trap / Future Bass is 38, Bass / Club is 85)': async () => {
    assert.deepEqual(genreById(38), { id: 38, name: 'Trap / Future Bass', slug: 'trap-future-bass' })
    assert.deepEqual(genreById(85), { id: 85, name: 'Bass / Club', slug: 'bass-club' })
    assert.deepEqual(genreById(98), { id: 98, name: 'Amapiano', slug: 'amapiano' })
  },
})
