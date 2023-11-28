const L = require('partial.lenses')
const R = require('ramda')

const durationLens = ['duration', L.multiply(1000), parseInt]

module.exports.bandcampTagTracksTransform = L.collect([
  L.elems,
  L.pick({
    id: 'item_id'
  })
])

const isVersionOrRemix = match => {
  if (!match) return false
  if (match[4] !== undefined && !match[4].startsWith('(feat.')) {
    const title = match[4].toLocaleLowerCase()
    if (title.includes('version') || title.includes('remix')) {
      return true
    }
  }
  return false
}

const hasFeat = match => {
  if (!match) return false
  return match[4] !== undefined && (match[4].startsWith('(feat.') || match[4].startsWith('(ft.'))
}

module.exports.bandcampReleasesTransform = L.collect([
  L.elems,
  L.choose(release => [
    'trackinfo',
    L.filter(R.prop('file')),
    L.elems,
    L.choose(track => {
      const match = track.title.match(new RegExp(/((.*?) - )?([^(]*)(\(([^)]*)\))?/))
      const releaseArtistId = release.url.substring(8, release.url.indexOf('.bandcamp.com'))
      const releaseArtistUrl = release.url.substring(0, release.url.indexOf('/', 8))
      const artistTemplate = {
        name: track.artist || release.artist,
        id: releaseArtistId || null,
        role: 'author',
        url: releaseArtistUrl || null
      }
      const versionOrRemix = isVersionOrRemix(match)
      const version = versionOrRemix ? match[4].substring(1, match[4].length - 1) : null
      const featuringArtists =
        !versionOrRemix && hasFeat(match) ? match[4].replace('(feat. ', '').replace('(ft. ', '').replace(')', '').split(/,&/) : []

      return [
        L.pick({
          id: 'id',
          title: match ? R.always(match[3].trim()) : 'title',
          version: R.always(version),
          artists: match
            ? R.always(
                (match[2]
                  ? match[2].split(/,&/).map(artist => {
                      const trimmedArtist = artist.trim()
                      const artistId = trimmedArtist.toLocaleLowerCase()
                      const isReleaseArtist = artistId === releaseArtistId
                      return {
                        ...artistTemplate,
                        name: track.artist || trimmedArtist,
                        ...(isReleaseArtist
                          ? {
                              id: releaseArtistId,
                              url: releaseArtistUrl
                            }
                          : { id: artistId, url: null })
                      }
                    })
                  : [artistTemplate]
                )
                  .concat(
                    match.length === 6 && match[5] !== undefined
                      ? match[5]
                          .replace(/version|remix/i, '')
                          .split(/[,&]/)
                          .map(remixer => ({
                            name: remixer.trim(),
                            id: null,
                            role: 'remixer',
                            url: null
                          }))
                      : []
                  )
                  .concat(
                    featuringArtists.map(name => ({
                      name: name.trim(),
                      id: null,
                      role: 'author',
                      url: null
                    }))
                  )
              )
            : R.always([artistTemplate]),
          released: R.always(release.current.release_date || release.current.publish_date),
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
      ]
    })
  ])
])
