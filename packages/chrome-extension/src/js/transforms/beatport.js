const L = require('partial.lenses')
const R = require('ramda')

const idToString = id => id.toString()

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

const previewUrlPath = [1, 'url']

module.exports.beatportTracksTransform = L.collect([
  L.elems,
  L.pick({
    title: [
      L.props('title', 'name', 'mix'),
      L.reread(({ title, name, mix }) => (title || name).replace(` (${mix})`, ''))
    ],
    version: 'mix',
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
      L.filter(R.path(previewUrlPath)),
      L.elems,
      L.pick({
        format: 0,
        url: previewUrlPath,
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
