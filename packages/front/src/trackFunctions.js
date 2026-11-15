import * as R from 'ramda'
import React from 'react'
import { Link } from 'react-router-dom'

export const trackTitle = (track) => (track ? `${track.title} ${track.version ? `(${track.version})` : ''}` : '')
export const namesToString = (entities, separator = ', ', lastSeparator = ' & ') => {
  const names = entities.map(R.prop('name'))
  if (names.length === 1) return names[0]
  const tail = names.splice(-1)
  return `${names.join(separator)}${tail.map((name) => `${lastSeparator || separator} ${name}`).join('')}`
}
export const followableNameLinks = (followable, follows, type, separator = ', ', lastSeparator = ' & ', onEntityClick = null) => {
  const links = followable.map(({ id, name }) => (
    <Link
      className={follows && follows[`${type}s`]?.some(({ id: followableId }) => id === followableId) ? 'followed' : ''}
      key={`${type}-${id}`}
      to={`/search?q=${type}:${id}`}
      onClick={(e) => {
        e.stopPropagation()
        if (onEntityClick && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault()
          onEntityClick(type, id, name, e.shiftKey)
        }
      }}
    >
      {name}
    </Link>
  ))
  if (links.length < 2) {
    return links[0]
  }
  const tail = links.splice(-1)
  return (
    <>
      {R.intersperse(separator, links)}{lastSeparator || separator} {tail[0]}
    </>
  )
}

// "Artists - title", the parts in spans of their own, so a one-line layout can cut each short separately (the docked
// player bar); inline they read as one line of text
export const artistsAndTitle = (artists, title) => (
  <>
    <span className="track-title_artists">{artists}</span>
    <span className="track-title_separator"> - </span>
    <span className="track-title_name">{title}</span>
  </>
)

export const trackArtistsAndTitle = (track, follows, onEntityClick = null) =>
  artistsAndTitle(
    followableNameLinks(
      R.uniq([track.artists, track.remixers].flat()) || [],
      follows,
      'artist',
      ', ',
      ' & ',
      onEntityClick,
    ),
    trackTitle(track),
  )

export const trackArtistsAndTitleText = (track) => `${namesToString(track.artists || [])} - ${trackTitle(track)}`
