const L = require('partial.lenses')
const R = require('ramda')

const externalUrlLens = ['external_urls', 'spotify']
module.exports.spotifyTracksTransform = L.collect([
  L.elems,
  L.pick({
    title: ['track', 'name'],
    id: ['track', 'id'],
    url: ['track', externalUrlLens],
    artists: L.partsOf(
      'track',
      L.branch({
        artists: [
          L.elems,
          L.pick({
            name: 'name',
            id: 'id',
            url: externalUrlLens,
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
    ),
    duration_ms: ['track', 'duration_ms'],
    release: [
      'track',
      'album',
      L.pick({
        id: 'id',
        title: 'name',
        url: externalUrlLens
      })
    ],
    released: 'added_at',
    published: 'added_at',
    previews: L.partsOf([
      'track',
      'preview_url',
      L.pick({
        format: R.always('mp3'),
        url: []
      })
    ]),
    // TODO: get from properties
    // key: ['key', L.reread(bpKey => spotifyKeysToCamelot[bpKey])],
    store_details: []
  })
])
