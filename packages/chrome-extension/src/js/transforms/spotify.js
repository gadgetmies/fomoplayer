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

const padDate = date => (date.length > 7 ? date : date.length > 4 ? `${date}-01` : `${date}-01-01`)
const releaseDateLens = releaseDate => {
  return R.always(padDate(releaseDate))
}

module.exports.spotifyAlbumTracksTransform = L.collect([
  L.elems,
  L.choose(({ release_date, name, id, href, external_ids: { isrc } }) => [
    'tracks',
    'items',
    L.elems,
    L.choose(({ preview_url }, i) =>
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
            track_number: L.ifElse(R.propEq('disc_number', 1), 'track_number', R.always(i + 1)),
            // TODO: release, released, published from album
            // TODO: get from properties
            // key: ['key', L.reread(bpKey => spotifyKeysToCamelot[bpKey])],
            store_details: []
          })
        : L.zero
    )
  ])
])

const trackOrRoot = L.choices('track', [])
module.exports.spotifyTracksTransform = L.collect([
  L.elems,
  L.pick({
    title: [trackOrRoot, 'name'],
    id: [trackOrRoot, 'id'],
    url: [trackOrRoot, urlLens],
    artists: L.partsOf(trackOrRoot, trackArtistsLens),
    duration_ms: [trackOrRoot, 'duration_ms'],
    release: [
      trackOrRoot,
      'album',
      L.pick({ id: 'id', title: 'name', url: urlLens })
    ],
    isrc: [trackOrRoot, 'external_ids', 'isrc'],
    track_number: 'track_number',
    released: [trackOrRoot, 'album', 'release_date', padDate],
    published: [L.choices('added_at', [trackOrRoot, 'album', 'release_date']), padDate],
    previews: L.partsOf([trackOrRoot, previewLens]),
    store_details: []
  })
])
