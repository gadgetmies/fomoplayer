// The audio distance of a similarity search result or a Sounds like track: the cosine distance between the two
// embeddings (0 the same sound, 2 the opposite), shown ×100 with one decimal. Close matches sit well under 0.1, so a
// rounded raw distance read 0 for nearly every result.
export const formatAudioDistance = (distance) =>
  typeof distance === 'number' && Number.isFinite(distance) ? (Math.max(0, distance) * 100).toFixed(1) : '-'

export const audioDistanceTitle = 'Audio distance ×100: 0 is the same sound, lower sounds closer'
