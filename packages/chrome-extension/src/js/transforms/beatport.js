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
module.exports.beatportTracksTransform = L.collect([
  'props',
  'pageProps',
  'dehydratedState',
  'queries',
  L.elems,
  'state',
  'data',
  'results',
  L.filter(R.prop('sample_url')),
  L.elems,
  L.pick({
    title: 'name',
    version: ['mix_name', removeOriginalMix],
    id: ['id', L.reread(idToString)],
    isrc: [
      L.pick({ isrc: 'isrc', track: 'number' }),
      ({ isrc, track }) => (isrc !== undefined ? `${isrc}:${track}` : L.zero)
    ],
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
      'release',
      L.pick({
        id: ['id', L.reread(idToString)],
        title: 'name',
        url: [L.props('slug', 'id'), L.reread(beatportUrl('release'))]
      })
    ],
    released: ['new_release_date'],
    published: ['publish_date'],
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
    store_details: []
  })
])

module.exports.beatportLibraryTransform = L.collect([
  L.elems,
  L.pick({
    title: ['name'],
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
    genres: L.partsOf(['genre', 'name']),
    duration_ms: ['length_ms'],
    release: [
      'release',
      L.pick({
        id: ['id', L.reread(idToString)],
        title: 'name',
        url: [L.props('slug', 'id'), L.reread(beatportUrl('release'))]
      })
    ],
    released: ['new_release_date'],
    published: ['publish_date'],
    purchased: ['purchase_date'],
    previews: L.partsOf(
      L.pick({
        format: R.always('mp3'),
        url: ['sample_url'],
        start_ms: ['sample_start_ms'],
        end_ms: ['sample_end_ms']
      })
    ),
    label: [
      'release',
      'label',
      L.pick({
        id: ['id', L.reread(idToString)],
        name: 'name',
        url: [L.props('slug', 'id'), L.reread(beatportUrl('label'))]
      })
    ],
    key: [
      L.props('camelot_number', 'camelot_letter'),
      L.reread(({ camelot_number, camelot_letter }) => `${camelot_number}${camelot_letter}`)
    ],
    store_details: []
  })
])
