/**
 * Cached Beatport genre catalog.
 *
 * Beatport exposes its genres at /v4/catalog/genres/, but they change rarely, so
 * the set is cached here in code rather than fetched on every request. The ids
 * and slugs below are taken verbatim from Beatport's own genre navigation, so
 * they match the storefront and v4 API exactly. The checkBeatportGenres job
 * compares this list against the live API and alerts when genres are added or
 * renamed so it can be updated. Regenerate the list with:
 *   npm run fetch:beatport-genres   (needs BEATPORT_USERNAME / BEATPORT_PASSWORD)
 *
 * A genre's top-100 lives at the storefront URL
 *   https://www.beatport.com/genre/{slug}/{id}/top-100
 * which the v4 client maps to /v4/catalog/genres/{id}/top/100/.
 *
 * Note: this covers the Electronic genres. Beatport's Open Format genres
 * (African, Caribbean, Country, DJ Edits, Hip-Hop, Latin, Pop, R&B, Rock) are
 * not included yet — the job will report them once their ids are available.
 */
const STORE_URL = 'https://www.beatport.com'

const GENRES = [
  { id: 1, name: 'Drum & Bass', slug: 'drum-bass' },
  { id: 2, name: 'Hard Techno', slug: 'hard-techno' },
  { id: 3, name: 'Electronica', slug: 'electronica' },
  { id: 5, name: 'House', slug: 'house' },
  { id: 6, name: 'Techno (Peak Time / Driving)', slug: 'techno-peak-time-driving' },
  { id: 7, name: 'Trance (Main Floor)', slug: 'trance-main-floor' },
  { id: 8, name: 'Hard Dance / Hardcore / Neo Rave', slug: 'hard-dance-hardcore-neo-rave' },
  { id: 9, name: 'Breaks / Breakbeat / UK Bass', slug: 'breaks-breakbeat-uk-bass' },
  { id: 11, name: 'Tech House', slug: 'tech-house' },
  { id: 12, name: 'Deep House', slug: 'deep-house' },
  { id: 13, name: 'Psy-Trance', slug: 'psy-trance' },
  { id: 14, name: 'Minimal / Deep Tech', slug: 'minimal-deep-tech' },
  { id: 15, name: 'Progressive House', slug: 'progressive-house' },
  { id: 16, name: 'DJ Tools / Acapellas', slug: 'dj-tools-acapellas' },
  { id: 18, name: 'Dubstep', slug: 'dubstep' },
  { id: 37, name: 'Indie Dance', slug: 'indie-dance' },
  { id: 38, name: 'Trap / Future Bass', slug: 'trap-future-bass' },
  { id: 39, name: 'Dance / Pop', slug: 'dance-pop' },
  { id: 50, name: 'Nu Disco / Disco', slug: 'nu-disco-disco' },
  { id: 63, name: 'Downtempo', slug: 'downtempo' },
  { id: 81, name: 'Funky House', slug: 'funky-house' },
  { id: 85, name: 'Bass / Club', slug: 'bass-club' },
  { id: 86, name: 'UK Garage / Bassline', slug: 'uk-garage-bassline' },
  { id: 89, name: 'Afro House', slug: 'afro-house' },
  { id: 90, name: 'Melodic House & Techno', slug: 'melodic-house-techno' },
  { id: 91, name: 'Bass House', slug: 'bass-house' },
  { id: 92, name: 'Techno (Raw / Deep / Hypnotic)', slug: 'techno-raw-deep-hypnotic' },
  { id: 93, name: 'Organic House', slug: 'organic-house' },
  { id: 94, name: 'Electro (Classic / Detroit / Modern)', slug: 'electro-classic-detroit-modern' },
  { id: 95, name: '140 / Deep Dubstep / Grime', slug: '140-deep-dubstep-grime' },
  { id: 96, name: 'Mainstage', slug: 'mainstage' },
  { id: 97, name: 'Jackin House', slug: 'jackin-house' },
  { id: 98, name: 'Amapiano', slug: 'amapiano' },
  { id: 99, name: 'Trance (Raw / Deep / Hypnotic)', slug: 'trance-raw-deep-hypnotic' },
  { id: 100, name: 'Ambient / Experimental', slug: 'ambient-experimental' },
  { id: 101, name: 'Brazilian Funk', slug: 'brazilian-funk' },
  { id: 111, name: 'Latin Electronic', slug: 'latin-electronic' },
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
