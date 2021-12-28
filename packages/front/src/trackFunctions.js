import * as R from 'ramda'
import React from 'react'

export const trackTitle = track => (track ? `${track.title} ${track.version ? `(${track.version})` : ''}` : '')
export const artistNamesToString = R.pipe(R.pluck('name'), R.join(', '))
export const trackArtistsAndTitle = track => `${artistNamesToString(track.artists || [])} - ${trackTitle(track)}`
