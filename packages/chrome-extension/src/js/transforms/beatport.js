const L = require('partial.lenses')
const R = require('ramda')

const idToString = id => id.toString()

const beatportUrl = type => ({ id, slug }) => `https://www.beatport.com/${type}/${slug}/${id}`

const sharedArtistPropsLens = {
  name: 'name',
  id: ['id', L.reread(n => n.toString(10))],
  url: [L.props('slug', 'id'), L.reread(beatportUrl('artist'))]
}

const removeOriginalMix = L.cond([R.equals('Original Mix'), L.zero], [[]])

const trackTransform = L.pick({
  title: 'name',
  version: ['mix_name', removeOriginalMix],
  id: ['id', L.reread(idToString)],
  url: [L.props('slug', 'id'), L.reread(beatportUrl('track'))],
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
  genres: L.partsOf([
    L.branch({
      genre: 'name',
      sub_genre: [
        'name',
        L.choose(x => {
          return x ? [] : L.zero
        })
      ]
    })
  ]),
  duration_ms: 'length_ms',
  release: [
    L.partsOf(
      L.branch({
        release: [
          L.pick({
            id: ['id', L.reread(idToString)],
            title: 'name',
            url: [L.props('slug', 'id'), L.reread(beatportUrl('release'))]
          })
        ],
        catalog_number: []
      })
    ),
    ([release, catalog_number]) => {
      return { catalog_number, ...release }
    }
  ],
  released: ['new_release_date'], // TODO: move to release?
  published: ['publish_date'],
  purchased: ['purchase_date'],
  previews: L.partsOf([
    L.pick({
      format: R.always('mp3'),
      url: ['sample_url'],
      start_ms: 'sample_start_ms',
      end_ms: 'sample_end_ms'
    })
  ]),
  label: [
    'release',
    'label',
    L.pick({
      id: ['id', L.reread(idToString)],
      name: 'name',
      url: [L.props('slug', 'id'), L.reread(beatportUrl('label'))]
    })
  ],
  waveform: [
    L.pick({
      url: ['image', 'uri'],
      start_ms: R.always(0),
      end_ms: 'length_ms'
    })
  ],
  key: [
    'key',
    L.cond([
      R.complement(R.equals(null)),
      L.reread(({ camelot_number, camelot_letter }) => `${camelot_number}${camelot_letter}`)
    ])
  ],
  bpm: 'bpm',
  isrc: 'isrc',
  track_number: 'number',
  store_details: []
})

module.exports.beatportTrackTransform = L.get(trackTransform)

module.exports.beatportTracksTransform = L.collect([
  L.choices('props',[]),
  'pageProps',
  'dehydratedState',
  'queries',
  L.elems,
  'state',
  'data',
  L.choices(['results', L.filter(R.prop('sample_url')), L.elems], [L.satisfying(R.prop('sample_url'))]),
  trackTransform
])

module.exports.beatportLibraryTransform = L.collect([
  // TODO: ensure this works on the new site + add catalog number, track number and isrc
  L.choices('props',[]),
  'pageProps',
  'dehydratedState',
  'queries',
  L.elems,
  'state',
  'data',
  'results',
  L.elems,
  trackTransform
])
