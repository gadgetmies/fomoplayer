/**
 * Cached Beatport genre catalog.
 *
 * Beatport exposes its genres at /v4/catalog/genres/, but they change rarely,
 * so the set is cached here in code rather than fetched on every request. Genre
 * *ids* are stable; names and slugs occasionally get renamed (e.g. id 86 went
 * from "Garage / Bassline / Grime" to "UK Garage / Bassline"). The
 * checkBeatportGenres job compares this list against the live API and alerts
 * when genres are added or renamed so the cache can be updated.
 *
 * A genre's top-100 lives at the storefront URL
 *   https://www.beatport.com/genre/{slug}/{id}/top-100
 * which the v4 client maps to /v4/catalog/genres/{id}/top/100/.
 */
const STORE_URL = 'https://www.beatport.com'

const GENRES = [
  { id: 1, name: 'Drum & Bass', slug: 'drum-bass' },
  { id: 3, name: 'Electronica / Downtempo', slug: 'electronica-downtempo' },
  { id: 5, name: 'House', slug: 'house' },
  { id: 6, name: 'Techno (Peak Time / Driving / Hard)', slug: 'techno-peak-time-driving-hard' },
  { id: 7, name: 'Trance', slug: 'trance' },
  { id: 8, name: 'Hard Dance / Hardcore', slug: 'hard-dance-hardcore' },
  { id: 9, name: 'Breaks', slug: 'breaks' },
  { id: 11, name: 'Tech House', slug: 'tech-house' },
  { id: 12, name: 'Deep House', slug: 'deep-house' },
  { id: 13, name: 'Psy-Trance', slug: 'psy-trance' },
  { id: 14, name: 'Minimal / Deep Tech', slug: 'minimal-deep-tech' },
  { id: 15, name: 'Progressive House', slug: 'progressive-house' },
  { id: 16, name: 'DJ Tools', slug: 'dj-tools' },
  { id: 17, name: 'Electro House', slug: 'electro-house' },
  { id: 18, name: 'Dubstep', slug: 'dubstep' },
  { id: 37, name: 'Indie Dance', slug: 'indie-dance' },
  { id: 38, name: 'Hip-Hop / R&B', slug: 'hip-hop-r-and-b' },
  { id: 39, name: 'Dance', slug: 'dance' },
  { id: 41, name: 'Reggae / Dancehall / Dub', slug: 'reggae-dancehall-dub' },
  { id: 50, name: 'Nu Disco / Disco', slug: 'nu-disco-disco' },
  { id: 65, name: 'Future House', slug: 'future-house' },
  { id: 79, name: 'Big Room', slug: 'big-room' },
  { id: 80, name: 'Leftfield House & Techno', slug: 'leftfield-house-and-techno' },
  { id: 81, name: "Funky / Groove / Jackin' House", slug: 'funky-groove-jackin-house' },
  { id: 85, name: 'Leftfield Bass', slug: 'leftfield-bass' },
  { id: 86, name: 'UK Garage / Bassline', slug: 'uk-garage-bassline' },
  { id: 87, name: 'Trap / Future Bass', slug: 'trap-future-bass' },
  { id: 89, name: 'Afro House', slug: 'afro-house' },
  { id: 90, name: 'Melodic House & Techno', slug: 'melodic-house-and-techno' },
  { id: 91, name: 'Bass House', slug: 'bass-house' },
  { id: 92, name: 'Techno (Raw / Deep / Hypnotic)', slug: 'techno-raw-deep-hypnotic' },
  { id: 95, name: '140 / Deep Dubstep / Grime', slug: '140-deep-dubstep-grime' },
]

const byId = new Map(GENRES.map((genre) => [String(genre.id), genre]))

const genreTop100Url = ({ slug, id }) => `${STORE_URL}/genre/${slug}/${id}/top-100`

const searchGenres = (query) => {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  return GENRES.filter(({ name, slug }) => name.toLowerCase().includes(needle) || slug.includes(needle))
}

module.exports = {
  genres: GENRES,
  genreById: (id) => byId.get(String(id)),
  genreTop100Url,
  searchGenres,
}
