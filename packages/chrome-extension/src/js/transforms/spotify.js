const L = require('partial.lenses')
const R = require('ramda')

const urlLens = ['external_urls', 'spotify']
const isrcLens = ['external_urls', 'isrc']
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

const releaseDateLens = releaseDate => R.always(releaseDate.length > 4 ? releaseDate : `${releaseDate}-01-01`)

module.exports.spotifyAlbumTracksTransform = L.collect([
  L.elems,
  L.choose(({ release_date, name, id, href }) => [
    'tracks',
    'items',
    L.elems,
    L.choose(({ preview_url }) =>
      preview_url
        ? L.pick({
            title: ['name', name => name.replace(/ - original mix/gi, '')],
            id: ['id'],
            isrc: isrcLens,
            url: urlLens,
            artists: L.partsOf(trackArtistsLens),
            duration_ms: ['duration_ms'],
            previews: L.partsOf(previewLens),
            released: releaseDateLens(release_date),
            published: releaseDateLens(release_date),
            release: R.always({ id, title: name, url: href }),
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
    isrc: ['track', isrcLens],
    artists: L.partsOf('track', trackArtistsLens),
    duration_ms: ['track', 'duration_ms'],
    release: [
      'track',
      'album',
      L.pick({
        id: 'id',
        title: 'name',
        url: urlLens
      })
    ],
    released: 'added_at',
    published: 'added_at',
    previews: L.partsOf(['track', previewLens]),
    // TODO: get from properties
    // key: ['key', L.reread(bpKey => spotifyKeysToCamelot[bpKey])],
    store_details: []
  })
])
