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
      // A Bandcamp subdomain can be either an artist or a label page. The
      // release URL of anything released *through* a label points at the
      // label's subdomain, so on a label page the subdomain is NOT the
      // artist. Only treat the subdomain as the artist's store id/url on
      // actual artist pages; on label pages artists are matched by name
      // (id/url null) so different artists on the same label don't collapse
      // into one another.
      const isLabelPage = release.pageType === 'label'
      const labelName = release.pageName || release.url.match(/https:\/\/([^.]*)/)[1]
      const releaseArtistId = release.url.substring(8, release.url.indexOf('.bandcamp.com'))
      const releaseArtistUrl = release.url.substring(0, release.url.indexOf('/', 8))
      const artistStoreId = isLabelPage ? null : releaseArtistId || null
      const artistStoreUrl = isLabelPage ? null : releaseArtistUrl || null
      const isLabelOrVariousName = (name) => {
        const n = (name || '').trim().toLocaleLowerCase()
        if (!n) return false
        return (
          (isLabelPage && n === labelName.toLocaleLowerCase()) ||
          ['various artists', 'various', 'v/a', 'va'].includes(n)
        )
      }
      const artistTemplate = {
        name: track.artist || release.artist,
        role: 'author',
        id: artistStoreId,
        url: artistStoreUrl,
      }
      // 0 = full original title
      // 1 = `${artists} -` if present
      // 2 = `${artists} if '-' present
      // 3 = title if no version or remix
      // 4 = title if remix or version
      // 5 = parentheses and contents
      // 6 = parentheses contents e.g. feat. or version
      // 7 = title after parentheses
      const match = track.title.match(new RegExp(/((.*?) - )?((([^(]*)(\((.*?)\)))?(([^(]*)(\((.*?)\)))?.*)/))
      const versionOrRemix = isVersionOrRemix(match[10] || match[6])
      const version = versionOrRemix ? match[11] || match[7] : null
      const featuringArtists = extractFeat(match[6]) || []
      let title = version || featuringArtists.length ? match[5].trim() : match[4] || match[3]?.trim()
      let authorNames = match[2]

      const sameName = (a) => (b) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()
      const remixerNames = versionOrRemix ? version.replace(/version|remix/i, '').split(/[,&]/) : []
      // "Remixer - Artists - Title (Remixer Remix)": the prefix only repeats the
      // remixer and the actual artists follow it in the title.
      const artistsInTitle = title?.match(/^(.+?) - (.+)$/)
      if (
        authorNames &&
        artistsInTitle &&
        authorNames.split(/[,&]/).every((name) => remixerNames.some(sameName(name)))
      ) {
        authorNames = artistsInTitle[1]
        title = artistsInTitle[2]
      }

      const createArtistWithRole = (role) => (artist) => {
        const trimmedArtist = artist.trim()
        const artistId = trimmedArtist.toLocaleLowerCase()
        const isReleaseArtist = !isLabelPage && artistId === releaseArtistId
        return {
          name: trimmedArtist || track.artist,
          role,
          ...(isReleaseArtist
            ? {
                id: artistStoreId,
                url: artistStoreUrl,
              }
            : { id: null, url: null }),
        }
      }

      const remixers = remixerNames.map(createArtistWithRole('remixer'))

      // A track always keeps an author: the track lists only show tracks with
      // one, so each filter below falls back to the authors it was given when
      // it would remove them all.
      const keepAnAuthor = (filtered, authors) => (filtered.length > 0 ? filtered : authors)

      const parsedAuthors = authorNames ? authorNames.split(/[,&]/).map(createArtistWithRole('author')) : [artistTemplate]
      // "Artists, Remixer - Title (Remixer Remix)" lists the remixer among the
      // authors; a self-remix ("Remixer - Title (Remixer Remix)") does not.
      const authors = keepAnAuthor(
        parsedAuthors.filter((artist) => !remixers.some(({ name }) => sameName(name)(artist.name))),
        parsedAuthors,
      ).concat(featuringArtists.map(createArtistWithRole('author')))

      // Drop the label / "Various Artists" entries so the label isn't stored
      // as an artist. Remix credits name artists, so only authors are filtered.
      const finalArtists = keepAnAuthor(
        authors.filter((artist) => !isLabelOrVariousName(artist.name)),
        authors,
      ).concat(remixers)

      return [
        L.pick({
          id: 'id',
          title: title ? R.always(title) : 'title',
          version: R.always(version),
          artists: R.always(finalArtists),
          released: R.always(release.current.release_date || release.current.publish_date),
          published: R.always(release.current.publish_date),
          duration_ms: durationLens,
          release: R.always({
            release_date: new Date(release.album_release_date).toISOString(),
            url: release.url,
            title: release.current.title,
            id: release.id.toString(10),
          }),
          // Only emit a label when the release is published through a label
          // page; on an artist page the subdomain is the artist, not a label.
          label: R.always(
            isLabelPage
              ? {
                  id: release.current.band_id.toString(10),
                  url: release.url.substr(0, release.url.search(/[^/:]\//) + 1),
                  name: labelName,
                }
              : null,
          ),
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
