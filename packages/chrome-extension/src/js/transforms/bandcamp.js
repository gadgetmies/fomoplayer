const L = require('partial.lenses')
const R = require('ramda')

const durationLens = ['duration', L.multiply(1000), parseInt]

module.exports.bandcampTagTracksTransform = L.collect([
  L.elems,
  L.pick({
    id: 'item_id'
  })
])

module.exports.bandcampReleasesTransform = L.collect([
  L.elems,
  L.choose(release => [
    'trackinfo',
    L.filter(R.prop('file')),
    L.elems,
    L.pick({
      id: 'id',
      title: 'title',
      artists: L.partsOf(
        L.pick({
          name: R.always(release.artist),
          id: R.always(release.artist), // TODO: is there any other way of differentiating the artists?
          role: R.always('author')
        })
      ),
      released: R.always(release.current.release_date),
      published: R.always(release.current.publish_date),
      duration_ms: durationLens,
      release: R.always({
        release_date: new Date(release.album_release_date).toISOString(),
        url: release.url,
        title: release.current.title,
        id: release.id.toString(10)
      }),
      label: R.always({
        id: release.current.band_id.toString(10),
        url: release.url.substr(0, release.url.search(/[^/:]\//) + 1),
        name: release.url.match(/https:\/\/([^.]*)/)[1]
      }),
      previews: L.partsOf(
        L.pick({
          // url: ['file', 'mp3-128'], // TODO: do not include the url because it will be fetched separately?
          format: R.always('mp3'),
          start_ms: R.always(0),
          end_ms: durationLens
        })
      ),
      store_details: []
    })
  ])
])
