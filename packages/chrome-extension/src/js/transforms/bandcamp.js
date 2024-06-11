const L = require('partial.lenses')
const R = require('ramda')

const durationLens = ['duration', L.multiply(1000), parseInt]

module.exports.bandcampTagTracksTransform = L.collect([
  L.elems,
  L.pick({
    id: 'item_id',
  }),
])

const isVersionOrRemix = (parenthesesContent) => {
  if (!parenthesesContent) return false
  if (!parenthesesContent.startsWith('(feat.')) {
    const title = parenthesesContent.toLocaleLowerCase()
    if (title.includes(' version') || title.includes(' remix')) {
      return true
    }
  }
  return false
}

const extractFeat = (match) => {
  if (!match) return false
  if (match.startsWith('(feat.') || match.startsWith('(ft.')) {
    return match.replace('(feat. ', '').replace('(ft. ', '').replace(')', '').split(/,&/)
  } else {
    return false
  }
}

module.exports.bandcampReleasesTransform = L.collect([
  L.elems,
  L.choose((release) => [
    'trackinfo',
    L.filter(R.prop('file')),
    L.elems,
    L.choose((track) => {
      const releaseArtistId = release.url.substring(8, release.url.indexOf('.bandcamp.com'))
      const releaseArtistUrl = release.url.substring(0, release.url.indexOf('/', 8))
      const artistTemplate = {
        name: track.artist || release.artist,
        role: 'author',
        id: releaseArtistId || null,
        url: releaseArtistUrl || null,
      }
      // 0 = full original title
      // 1 = artists and '-' if present
      // 2 = artists if '-' present
      // 3 = title if no version or remix
      // 4 = title if remix or version
      // 5 = parentheses and contents
      // 6 = parentheses contents e.g. feat. or version
      // 7 = title after parentheses
      const match = track.title.match(new RegExp(/((.*?) - )?((([^(]*)(\((.*?)\)))?(([^(]*)(\((.*?)\)))?.*)/))
      const versionOrRemix = isVersionOrRemix(match[10] || match[6])
      const version = versionOrRemix ? match[11] || match[7] : null
      const featuringArtists = extractFeat(match[6]) || []
      const title = version || featuringArtists.length ? match[5].trim() : match[4]

      const createArtistWithRole = (role) => (artist) => {
        const trimmedArtist = artist.trim()
        const artistId = trimmedArtist.toLocaleLowerCase()
        const isReleaseArtist = artistId === releaseArtistId
        return {
          name: trimmedArtist || track.artist,
          role,
          ...(isReleaseArtist
            ? {
                id: releaseArtistId,
                url: releaseArtistUrl,
              }
            : { id: null, url: null }),
        }
      }

      const remixers = versionOrRemix
        ? (match[11] || match[7])
            .replace(/version|remix/i, '')
            .split(/[,&]/)
            .map(createArtistWithRole('remixer'))
        : []

      const artists = match[2]
        ? match[2]
            .split(/[,&]/)
            .map(createArtistWithRole('author'))
            .filter((artist) => !remixers.find(({ name }) => name === artist.name))
        : [artistTemplate]

      return [
        L.pick({
          id: 'id',
          title: title ? R.always(title) : 'title',
          version: R.always(version),
          artists: match
            ? R.always(artists.concat(featuringArtists.map(createArtistWithRole('author'))).concat(remixers))
            : R.always([artistTemplate]),
          released: R.always(release.current.release_date || release.current.publish_date),
          published: R.always(release.current.publish_date),
          duration_ms: durationLens,
          release: R.always({
            release_date: new Date(release.album_release_date).toISOString(),
            url: release.url,
            title: release.current.title,
            id: release.id.toString(10),
          }),
          label: R.always({
            id: release.current.band_id.toString(10),
            url: release.url.substr(0, release.url.search(/[^/:]\//) + 1),
            name: release.url.match(/https:\/\/([^.]*)/)[1],
          }),
          previews: L.partsOf(
            L.pick({
              // url: ['file', 'mp3-128'], // TODO: do not include the url because it will be fetched separately?
              format: R.always('mp3'),
              start_ms: R.always(0),
              end_ms: durationLens,
            }),
          ),
          store_details: [],
        }),
      ]
    }),
  ]),
])
