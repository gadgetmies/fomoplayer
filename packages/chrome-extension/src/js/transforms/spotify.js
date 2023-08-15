const L = require('partial.lenses')
const R = require('ramda')

const urlLens = ['external_urls', 'spotify']
const trackArtistsLens = L.branch({
  artists: [
    L.elems,
    L.pick({
      name: 'name',
      id: 'id',
      url: urlLens,
      role: R.always('author')
    })
  ]
  // , TODO
  // remixers: [
  //   L.elems,
  //   L.pick({
  //     ...sharedArtistPropsLens,
  //     role: R.always('remixer')
  //   })
  // ]
})

const previewLens = [
  'preview_url',
  L.pick({
    format: R.always('mp3'),
    url: []
  })
]

const releaseDateLens = releaseDate =>
  R.always(releaseDate.length > 7 ? releaseDate : releaseDate.length > 4 ? `${releaseDate}-01` : `${releaseDate}-01-01`)

module.exports.spotifyAlbumTracksTransform = L.collect([
  L.elems,
  L.choose(({ release_date, name, id, href, external_ids: { isrc } }) => [
    'tracks',
    'items',
    L.elems,
    L.choose(({ preview_url }) =>
      preview_url
        ? L.pick({
            title: ['name', name => name.replace(/( - original mix)|( - .* remix)/gi, '')],
            version: ['name', name => (name.match(/ - (.* remix)/i) || [])[1]],
            id: ['id'],
            url: urlLens,
            artists: L.partsOf(trackArtistsLens),
            duration_ms: ['duration_ms'],
            previews: L.partsOf(previewLens),
            label: L.pick({ name: ['label'] }),
            released: releaseDateLens(release_date),
            published: releaseDateLens(release_date),
            release: R.always({ id, title: name, url: href, isrc }),
            isrc: ['external_ids', 'isrc'],
            track_number: 'track_number',
            // TODO: release, released, published from album
            // TODO: get from properties
            // key: ['key', L.reread(bpKey => spotifyKeysToCamelot[bpKey])],
            store_details: []
          })
        : L.zero
    )
  ])
])

module.exports.spotifyTracksTransform = L.collect([
  L.elems,
  L.pick({
    title: ['track', 'name'],
    id: ['track', 'id'],
    url: ['track', urlLens],
    artists: L.partsOf('track', trackArtistsLens),
    duration_ms: ['track', 'duration_ms'],
    release: [
      'track',
      L.partsOf(
        L.branch({ isrc: ['external_urls', 'isrc'], album: L.pick({ id: 'id', title: 'name', url: urlLens }) })
      ),
      ([isrc, album]) => ({ isrc, ...album })
    ],
    track_number: 'track_number',
    released: 'added_at',
    published: 'added_at',
    previews: L.partsOf(['track', previewLens]),
    store_details: []
  })
])
