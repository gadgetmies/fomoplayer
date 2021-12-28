const trackTitle = track => (track ? `${track.title} ${track.version ? `(${track.version})` : ''}` : '')

export { trackTitle }
