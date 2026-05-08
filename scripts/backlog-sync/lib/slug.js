'use strict'

const SLUG_MAX_LEN = 60

function titleToSlug(title) {
  const slugged = (title || 'untitled')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, SLUG_MAX_LEN)
    .replace(/-+$/, '')
  return slugged || 'untitled'
}

function padId(n) {
  return String(n).padStart(3, '0')
}

function nextFreeId(usedIds) {
  let n = 1
  const seen = new Set(usedIds.map((s) => parseInt(s, 10)).filter((x) => !Number.isNaN(x)))
  while (seen.has(n)) n += 1
  return padId(n)
}

// Strip a leading "<id> " prefix from a title, if present, so we can sync
// titles cleanly between FS frontmatter (no prefix) and GH (id-prefixed).
function stripIdPrefix(title) {
  const m = /^(\d{1,4})\s+(.*)$/s.exec(title.trim())
  return m ? { id: padId(parseInt(m[1], 10)), title: m[2] } : { id: null, title: title.trim() }
}

function withIdPrefix(id, title) {
  return `${id} ${title}`
}

module.exports = { titleToSlug, padId, nextFreeId, stripIdPrefix, withIdPrefix }
