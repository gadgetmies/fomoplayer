import * as R from 'ramda'
import React from 'react'
import { Link } from 'react-router-dom'

export const trackTitle = track => (track ? `${track.title} ${track.version ? `(${track.version})` : ''}` : '')
export const namesToString = entities => {
  const names = entities.map(R.prop('name'))
  if (names.length === 1) return names[0]
  const tail = names.splice(-1)
  return `${names.join(', ')}${tail.map(name => ` & ${name}`).join('')}`
}
export const followableNameLinks = (followable, follows, type) => {
  const links = followable.map(({ id, name }) => (
    <Link
      className={follows && follows[`${type}s`]?.some(({ id: followableId }) => id === followableId) ? 'followed' : ''}
      key={`${type}-${id}`}
      to={`/search?q=${type}:${id}`}
      onClick={e => e.stopPropagation()}
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
      {R.intersperse(', ', links)} & {tail[0]}
    </>
  )
}

export const trackArtistsAndTitle = (track, follows) => (
  <>
    {followableNameLinks(R.uniq([track.artists, track.remixers].flat()) || [], follows, 'artist')} - {trackTitle(track)}
  </>
)

export const trackArtistsAndTitleText = track => `${namesToString(track.artists || [])} - ${trackTitle(track)}`
