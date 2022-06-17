const scoreWeights = {
  artist: { label: 'Artist purchases', min: 0, max: 10, step: 1, unit: 'points added  per purchased tracks by artist' },
  label: { label: 'Label purchases', min: 0, max: 10, step: 1, unit: 'points added per purchased tracks by label' },
  artist_follow: { label: 'Artist follow', min: 0, max: 10, step: 1, unit: 'points added per followed artists' },
  label_follow: { label: 'Label follow', min: 0, max: 10, step: 1, unit: 'points added per followed labels' },
  date_released: {
    label: 'Date released',
    min: 0,
    max: 5,
    step: 0.1,
    isPenalty: true,
    unit: 'points subtracted per day since release'
  },
  date_published: {
    label: 'Date published',
    min: 0,
    max: 5,
    step: 0.1,
    isPenalty: true,
    unit: 'points subtracted per day since publish'
  },
  date_added: {
    label: 'Date added',
    min: 0,
    max: 5,
    step: 0.1,
    isPenalty: true,
    unit: 'points subtracted per day since added'
  }
}
export default scoreWeights
