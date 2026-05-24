// Heuristics for spotting an artist record whose name actually bundles several
// artists (e.g. "Sleepnet & Lumen", "Unglued x Whiney", "Camo & Krooked
// featuring Rezar"). Detection is intentionally permissive — many real names
// contain these tokens ("Camo & Krooked") — so a flag is only a suggestion an
// admin reviews, splits, or ignores. Pure string functions, no DB, so they can
// be unit tested and shared between the detection job and the admin layer.

// Word separators are only treated as such when surrounded by whitespace, so
// the "x" in "Mxrcy" or the "and" in "Anderson" never matches. Longer
// alternatives come first so "featuring" wins over "feat", "vs." over "vs".
const WORD_SEPARATORS = ['featuring', 'feat\\.?', 'ft\\.?', 'versus', 'vs\\.?', 'presents', 'pres\\.?', 'and', 'x']

// Symbol separators may appear with or without surrounding whitespace ("A, B"
// and "A,B" both split).
const SYMBOL_SEPARATOR_CLASS = '[&,+/;]'

const WORD_SEPARATOR_PATTERN = `\\s+(?:${WORD_SEPARATORS.join('|')})\\s+`
const SYMBOL_SEPARATOR_PATTERN = `\\s*${SYMBOL_SEPARATOR_CLASS}\\s*`

const SPLIT_REGEX = new RegExp(`${SYMBOL_SEPARATOR_PATTERN}|${WORD_SEPARATOR_PATTERN}`, 'gi')
// A fresh non-global copy: a shared /g regex carries lastIndex between .test()
// calls and would give alternating results.
const DETECT_REGEX = new RegExp(`${SYMBOL_SEPARATOR_PATTERN}|${WORD_SEPARATOR_PATTERN}`, 'i')

// True when the name contains at least one separator that commonly joins
// multiple artists.
const hasSplitSeparators = (name) => (name ? DETECT_REGEX.test(name) : false)

// Best-effort split of a combined name into its parts, trimmed and de-duped of
// empties. Only a starting point for the admin: e.g. "Camo & Krooked featuring
// Rezar" yields ["Camo", "Krooked", "Rezar"] and the admin recombines the first
// two if "Camo & Krooked" is one artist.
const suggestArtistSplit = (name) =>
  (name || '')
    .split(SPLIT_REGEX)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

module.exports = { hasSplitSeparators, suggestArtistSplit }
