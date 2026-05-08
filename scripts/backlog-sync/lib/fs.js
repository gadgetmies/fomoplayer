'use strict'

const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const crypto = require('crypto')

const { BACKLOG_DIR, FS_ALL_STATUSES } = require('./config')
const frontmatter = require('./frontmatter')
const { padId } = require('./slug')

const ITEM_DIRS = ['tasks', 'stories', 'epics']

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex')

// Canonical body normalization for hashing: trim both ends. The GitHub side
// goes through buildIssueBody (trims trailing) + stripIssueFooter (trims
// trailing again on extraction), so we have to match here.
const normalizeBody = (s) => (s || '').replace(/^\s+|\s+$/g, '')

async function readItemFolder(kind, dirent) {
  const folder = path.join(BACKLOG_DIR, kind, dirent.name)
  const readme = path.join(folder, 'README.md')
  let content = ''
  try {
    content = await fsp.readFile(readme, 'utf8')
  } catch {
    return null
  }
  const { fields, body } = frontmatter.parse(content)
  // Folder name shape: NNN-slug for tasks/stories; <slug> for epics.
  const m = /^(\d{1,4})-(.*)$/.exec(dirent.name)
  const folderId = m ? padId(parseInt(m[1], 10)) : null
  const folderSlug = m ? m[2] : dirent.name
  const id = fields.id ? padId(parseInt(fields.id, 10)) : folderId
  return {
    kind, // 'tasks' | 'stories' | 'epics'
    id,
    slug: folderSlug,
    folderName: dirent.name,
    folder,
    readme,
    title: fields.title || folderSlug,
    effort: fields.effort || null,
    created: fields.created || null,
    body: body.trimStart(),
    bodyHash: sha256(normalizeBody(body)),
    rawContent: content,
    rawFields: fields,
  }
}

async function readAllItems() {
  const items = []
  for (const kind of ITEM_DIRS) {
    const root = path.join(BACKLOG_DIR, kind)
    let entries = []
    try {
      entries = await fsp.readdir(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const item = await readItemFolder(kind, e)
      if (item) items.push(item)
    }
  }
  return items
}

// Resolve symlinks under each status folder, mapping FS id -> { status, prefix, linkName }.
async function readStatusSymlinks() {
  const map = new Map() // id (or epic slug) -> { status, prefix, linkName, target }
  for (const status of FS_ALL_STATUSES) {
    const dir = path.join(BACKLOG_DIR, status)
    let entries = []
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      if (!e.isSymbolicLink()) continue
      const linkPath = path.join(dir, e.name)
      let target
      try {
        target = await fsp.readlink(linkPath)
      } catch {
        continue
      }
      // Parse the link name: <prefix>-<id>-<slug> for tasks/stories, or
      // <prefix>-<slug> / <id>-<slug> for archives where prefix is omitted.
      const closed = status === 'done' || status === 'dropped'
      let prefix = null
      let id = null
      let slug = null
      if (closed) {
        // <id>-<slug> in done/dropped (no prefix per backlog convention).
        const m = /^(\d{1,4})-(.*)$/.exec(e.name)
        if (m) {
          id = padId(parseInt(m[1], 10))
          slug = m[2]
        } else {
          // Epic archive — no id.
          slug = e.name
        }
      } else {
        // <prefix>-<id>-<slug> in active folders.
        const m = /^([a-z]+)-(\d{1,4})-(.*)$/.exec(e.name)
        if (m) {
          prefix = m[1]
          id = padId(parseInt(m[2], 10))
          slug = m[3]
        } else {
          // Could be <prefix>-<slug> for an epic in a status folder.
          const m2 = /^([a-z]+)-(.*)$/.exec(e.name)
          if (m2) {
            prefix = m2[1]
            slug = m2[2]
          }
        }
      }
      const key = id || slug
      map.set(key, { status, prefix, linkName: e.name, target, id, slug })
    }
  }
  return map
}

async function readState() {
  const items = await readAllItems()
  const symlinks = await readStatusSymlinks()
  // Annotate items with their status/prefix from symlinks.
  for (const item of items) {
    const key = item.id || item.slug
    const info = symlinks.get(key)
    if (info) {
      item.status = info.status
      item.priorityPrefix = info.prefix
      item.linkName = info.linkName
    } else {
      item.status = null // member of a story; no independent status
      item.priorityPrefix = null
      item.linkName = null
    }
  }
  return { items, symlinks }
}

async function writeItemFolder({ kind, id, slug, title, effort, created, body }) {
  const folderName = id ? `${id}-${slug}` : slug
  const folder = path.join(BACKLOG_DIR, kind, folderName)
  await fsp.mkdir(folder, { recursive: true })
  const fields = {}
  if (id) fields.id = id
  fields.title = title
  if (effort) fields.effort = effort
  if (created) fields.created = created
  const readmeContent = frontmatter.serialize({ fields, body: body || '' })
  await fsp.writeFile(path.join(folder, 'README.md'), readmeContent)
  // Create a notes.md if missing.
  const notesPath = path.join(folder, 'notes.md')
  if (!fs.existsSync(notesPath)) {
    await fsp.writeFile(
      notesPath,
      `# Notes\n\nWorking notebook for this item. Date entries so future sessions can skim.\n\n## Decisions\n\n- _YYYY-MM-DD_ — decision and reasoning\n\n## Rejected approaches\n\n- _YYYY-MM-DD_ — what was tried, why it didn't work.\n\n## Open threads\n\n-\n\n## Session log\n\n- _YYYY-MM-DD_ — short note on what was done / discovered this session\n`,
    )
  }
  return folder
}

async function createSymlink({ status, prefix, id, slug, kind }) {
  const closed = status === 'done' || status === 'dropped'
  const folderName = id ? `${id}-${slug}` : slug
  let linkName
  if (closed) {
    linkName = folderName
  } else {
    linkName = `${prefix}-${folderName}`
  }
  const target = path.join('..', kind, folderName)
  const linkPath = path.join(BACKLOG_DIR, status, linkName)
  // Idempotent: remove existing symlink first.
  try {
    await fsp.unlink(linkPath)
  } catch {}
  await fsp.symlink(target, linkPath)
  return linkName
}

async function moveSymlink({ fromStatus, fromLinkName, toStatus, toLinkName }) {
  const fromPath = path.join(BACKLOG_DIR, fromStatus, fromLinkName)
  const toPath = path.join(BACKLOG_DIR, toStatus, toLinkName)
  await fsp.rename(fromPath, toPath)
}

async function updateItemFrontmatter(item, newFields) {
  const updated = { ...item.rawFields, ...newFields }
  const content = frontmatter.serialize({ fields: updated, body: item.body })
  await fsp.writeFile(item.readme, content)
}

async function updateItemBody(item, newBody) {
  const content = frontmatter.serialize({ fields: item.rawFields, body: newBody })
  await fsp.writeFile(item.readme, content)
}

module.exports = {
  sha256,
  normalizeBody,
  readState,
  readAllItems,
  readStatusSymlinks,
  writeItemFolder,
  createSymlink,
  moveSymlink,
  updateItemFrontmatter,
  updateItemBody,
}
