// Heuristics for spotting an artist record whose name was polluted by
// track-title or version metadata at import time — a leaked "feat. X"
// byline, a trailing "Remix" / "VIP" / "Bootleg" tag, parenthetical or
// bracketed text, stray whitespace or punctuation. Detection is
// intentionally permissive (the existing artist-split detector reads
// "feat." as a multi-artist signal; here it is a name-pollution signal),
// so a flag is only a suggestion an admin reviews and either renames
// (strip the junk), merges into the real artist, or deletes if the
// record is bogus. Pure string functions, no DB, so they can be unit
// tested and shared between the detection job and the standalone SQL
// exploration query.
//
// Lookbehinds/lookaheads keep word-boundary matches honest: "featuring"
// matches but "Featherweight" does not, "Remix" matches but "Remixer"
// does not.
const FEAT_WORDS = ['featuring', 'feat', 'ft']
const VERSION_TAG_WORDS = [
  'remix',
  'rmx',
  'edit',
  'vip',
  'bootleg',
  'dub',
  'rework',
  'instrumental',
  'mashup',
  'flip',
]

const FEAT_REGEX = new RegExp(`(?<![a-z])(?:${FEAT_WORDS.join('|')})\\.?(?![a-z])`, 'i')
const VERSION_TAG_REGEX = new RegExp(`(?<![a-z])(?:${VERSION_TAG_WORDS.join('|')})(?![a-z])`, 'i')
const BRACKETS_REGEX = /[(\[{]/
// Edge whitespace, double-space, or a dangling separator at the start/end.
const STRAY_PUNCT_REGEX = /^\s|\s$|\s\s|^[,;&+/-]|[,;&+/-]$/

// Stripping patterns for the suggested cleaned name. Applied in a fixed
// order and iterated until the name stabilises. Leading vs. trailing feat
// is split so the canonical artist survives in either layout:
//   "Foo feat. Bar" → "Foo"   (drop the guest tail, keep the host)
//   "feat. Bar"     → "Bar"   (drop the leaked byline, keep the real name)
// The tail variant requires whitespace before "feat" so it does not fire
// inside "(feat. Bar)" — the bracket strip handles that on a later pass.
const TAIL_BRACKETS_STRIP = /\s*[(\[{][^()\[\]{}]*[)\]}]\s*$/
const FEAT_TAIL_STRIP = new RegExp(`\\s(?:${FEAT_WORDS.join('|')})\\.?\\s+.+$`, 'i')
const LEADING_FEAT_STRIP = new RegExp(`^(?:${FEAT_WORDS.join('|')})\\.?\\s+`, 'i')
const TAIL_VERSION_TAG_STRIP = new RegExp(`\\s+(?:${VERSION_TAG_WORDS.join('|')})\\.?\\s*$`, 'i')
const EDGE_PUNCT_TRIM = /^[\s,;&+/-]+|[\s,;&+/-]+$/g

// Which pollution patterns the name matches. Order is stable so the radiator
// UI can render chips deterministically.
const detectIssueKinds = (name) => {
  if (!name) return []
  const kinds = []
  if (FEAT_REGEX.test(name)) kinds.push('feat')
  if (VERSION_TAG_REGEX.test(name)) kinds.push('versionTag')
  if (BRACKETS_REGEX.test(name)) kinds.push('parenthetical')
  if (STRAY_PUNCT_REGEX.test(name)) kinds.push('whitespace')
  return kinds
}

// Best-effort cleanup that strips one polluting fragment at a time until the
// name stabilises. Only a starting point for the admin: e.g. "Foo (Bar Remix)"
// suggests "Foo", but the admin may instead want to merge into "Bar" and
// delete the bogus record entirely.
const suggestCleanedName = (name) => {
  if (!name) return ''
  let current = name
  // Each pass strips at most one of each fragment type; the loop catches
  // nested cases like "Foo (feat. Bar) (VIP)" without a runaway regex.
  for (let i = 0; i < 8; i++) {
    const before = current
    current = current
      .replace(TAIL_BRACKETS_STRIP, '')
      .replace(FEAT_TAIL_STRIP, '')
      .replace(LEADING_FEAT_STRIP, '')
      .replace(TAIL_VERSION_TAG_STRIP, '')
      .replace(/\s{2,}/g, ' ')
      .replace(EDGE_PUNCT_TRIM, '')
      .trim()
    if (current === before) break
  }
  return current
}

// Returns null when the name is clean. Otherwise returns the detected
// kinds and a suggested cleaned name (or null when cleanup did not change
// the original — e.g. "(Foo)" with no other tokens, where the admin needs
// to decide manually).
const detectArtistNameIssues = (name) => {
  const kinds = detectIssueKinds(name)
  if (kinds.length === 0) return null
  const cleaned = suggestCleanedName(name)
  return {
    kinds,
    suggestedName: cleaned && cleaned !== name ? cleaned : null,
  }
}

module.exports = { detectArtistNameIssues, detectIssueKinds, suggestCleanedName }
