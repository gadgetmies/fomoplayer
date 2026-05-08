'use strict'

// Minimal YAML frontmatter parser/serializer scoped to the fields the backlog
// uses: id (string, zero-padded), title (string, may be quoted), effort
// (S|M|L|XL), created (ISO date). Nothing else is supported — for richer YAML
// reach for a real parser.

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

const unquote = (s) => {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1)
  }
  return t
}

const needsQuoting = (s) => /[:#'"\n]/.test(s) || /^\s|\s$/.test(s) || s === ''

const quote = (s) => {
  if (!needsQuoting(s)) return s
  // Use single quotes; escape any embedded single quote by doubling.
  return `'${s.replace(/'/g, "''")}'`
}

function parse(content) {
  const match = FRONTMATTER_RE.exec(content)
  if (!match) return { fields: {}, body: content }
  const [, head, body] = match
  const fields = {}
  for (const line of head.split(/\r?\n/)) {
    if (!line.trim()) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    const value = unquote(line.slice(idx + 1))
    fields[key] = value
  }
  return { fields, body }
}

function serialize({ fields, body }) {
  const order = ['id', 'title', 'effort', 'created']
  const seen = new Set()
  const lines = ['---']
  for (const key of order) {
    if (key in fields) {
      lines.push(`${key}: ${quote(String(fields[key]))}`)
      seen.add(key)
    }
  }
  for (const [key, value] of Object.entries(fields)) {
    if (seen.has(key)) continue
    lines.push(`${key}: ${quote(String(value))}`)
  }
  lines.push('---', '')
  return `${lines.join('\n')}${body || ''}`
}

module.exports = { parse, serialize }
