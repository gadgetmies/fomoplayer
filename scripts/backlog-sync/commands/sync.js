'use strict'

const path = require('path')
const fs = require('../lib/fs')
const ghLib = require('../lib/gh')
const stateLib = require('../lib/state')
const slug = require('../lib/slug')
const prompt = require('../lib/prompt')
const {
  FS_TO_GH_STATUS,
  GH_TO_FS_STATUS,
  GH_CLOSED_REASON_TO_FS,
  FS_CLOSED_TO_GH_REASON,
  FIELD_BACKLOG_ID,
  FIELD_PRIORITY,
  FIELD_EFFORT,
  FIELD_STATUS,
  DEFAULT_PRIORITY_PREFIX,
} = require('../lib/config')

const FOOTER_MARKER = '<!-- backlog-sync:footer -->'

const buildIssueBody = ({ folderRel, body }) => {
  const trimmedBody = (body || '').replace(/\s+$/, '')
  const footer = `${FOOTER_MARKER}\n\n---\n\nSynced from \`${folderRel}/\`. Edits to title/body/status here are reconciled into the filesystem on the next \`backlog-sync sync\` run; conflicting edits prompt for per-item resolution.`
  return `${trimmedBody}\n\n${footer}\n`
}

const stripIssueFooter = (body) => {
  if (!body) return ''
  const idx = body.indexOf(FOOTER_MARKER)
  if (idx < 0) return body
  return body.slice(0, idx).replace(/\s+$/, '')
}

const ghStatusToFs = (ghStatus, isClosed, stateReason) => {
  if (isClosed) return GH_CLOSED_REASON_TO_FS[stateReason] || 'done'
  return GH_TO_FS_STATUS[ghStatus] || 'todo'
}

const snap = (s) => stateLib.snapshotForState(s)

function fsSnapshot(item) {
  return snap({
    title: item.title,
    bodyHash: item.bodyHash,
    status: item.status,
    priorityPrefix: item.priorityPrefix,
    effort: item.effort,
  })
}

function ghSnapshot(ghItem) {
  const content = ghItem.content || {}
  const isClosed = content.state === 'CLOSED'
  // Pull the FS-equivalent status reflecting closed state.
  const status = isClosed
    ? GH_CLOSED_REASON_TO_FS[content.stateReason] || 'done'
    : ghItem.fields[FIELD_STATUS] || null
  // Strip footer for hashing (so adding/removing the footer alone doesn't
  // count as a change).
  const bareBody = stripIssueFooter(content.body)
  const titleStripped = slug.stripIdPrefix(content.title || '').title
  return {
    title: titleStripped,
    bodyHash: ghLib.sha256(bareBody),
    status,
    priorityPrefix: ghItem.fields[FIELD_PRIORITY] || null,
    effort: ghItem.fields[FIELD_EFFORT] || null,
  }
}

function changed(current, baseline) {
  if (!baseline) return false
  return (
    current.title !== baseline.title ||
    current.bodyHash !== baseline.bodyHash ||
    (current.status || null) !== (baseline.status || null) ||
    (current.priorityPrefix || null) !== (baseline.priorityPrefix || null) ||
    (current.effort || null) !== (baseline.effort || null)
  )
}

async function applyFsToGh({ item, ghItem, projItemId, issueId }) {
  // Push FS values to GH.
  const folderRel = path.relative(path.join(__dirname, '..', '..', '..'), item.folder)
  const newGhTitle = item.id ? slug.withIdPrefix(item.id, item.title) : item.title
  const newIssueBody = buildIssueBody({ folderRel, body: item.body })
  await ghLib.updateIssue({ issueId, title: newGhTitle, body: newIssueBody })
  // Status:
  if (item.status === 'done' || item.status === 'dropped') {
    if (ghItem.content?.state !== 'CLOSED') {
      await ghLib.closeIssue({ issueId, reason: FS_CLOSED_TO_GH_REASON[item.status] })
    }
  } else if (item.status) {
    if (ghItem.content?.state === 'CLOSED') {
      await ghLib.reopenIssue({ issueId })
    }
    const ghStatus = FS_TO_GH_STATUS[item.status]
    if (ghStatus) {
      await ghLib.ensureSingleSelectOption({ fieldName: FIELD_STATUS, optionName: ghStatus })
      await ghLib.setSingleSelectField({ itemId: projItemId, fieldName: FIELD_STATUS, optionName: ghStatus })
    }
  }
  // Priority + Effort:
  await ghLib.setTextField({ itemId: projItemId, fieldName: FIELD_PRIORITY, value: item.priorityPrefix || null })
  if (item.effort) {
    await ghLib.setSingleSelectField({ itemId: projItemId, fieldName: FIELD_EFFORT, optionName: item.effort })
  }
  // Backlog ID (idempotent):
  if (item.id) await ghLib.setTextField({ itemId: projItemId, fieldName: FIELD_BACKLOG_ID, value: item.id })

  // Return the canonical snapshot — the values ghSnapshot would produce on
  // the next read of this issue. ghSnapshot strips the id prefix from the
  // title and the footer from the body before hashing; for closed issues it
  // converts the state into the FS-equivalent ('done' / 'dropped'). Storing
  // raw values here would make every subsequent sync re-detect the item as
  // "GH changed" until the snapshots happened to realign.
  const closed = item.status === 'done' || item.status === 'dropped'
  return {
    title: item.title,
    bodyHash: ghLib.sha256(stripIssueFooter(newIssueBody)),
    status: closed ? item.status : (FS_TO_GH_STATUS[item.status] || null),
    priorityPrefix: item.priorityPrefix,
    effort: item.effort,
  }
}

async function applyGhToFs({ item, ghItem }) {
  const content = ghItem.content || {}
  const isClosed = content.state === 'CLOSED'
  const stateReason = content.stateReason
  const newFsStatus = ghStatusToFs(ghItem.fields[FIELD_STATUS], isClosed, stateReason)
  const newTitle = slug.stripIdPrefix(content.title || '').title
  const newBody = stripIssueFooter(content.body)
  const newPriority = ghItem.fields[FIELD_PRIORITY] || item.priorityPrefix || DEFAULT_PRIORITY_PREFIX
  const newEffort = ghItem.fields[FIELD_EFFORT] || item.effort || null

  // Update README (frontmatter + body)
  await fs.updateItemFrontmatter(item, {
    title: newTitle,
    effort: newEffort,
  })
  await fs.updateItemBody(item, newBody)

  // Move symlink if status changed.
  if (item.status !== newFsStatus || (item.priorityPrefix || null) !== newPriority) {
    if (item.linkName && item.status) {
      // Compose the new link name.
      const closed = newFsStatus === 'done' || newFsStatus === 'dropped'
      const folderName = item.id ? `${item.id}-${item.slug}` : item.slug
      const newLink = closed ? folderName : `${newPriority}-${folderName}`
      await fs.moveSymlink({
        fromStatus: item.status,
        fromLinkName: item.linkName,
        toStatus: newFsStatus,
        toLinkName: newLink,
      })
    } else {
      // No existing link (e.g. it was a story-member task before); create one.
      await fs.createSymlink({
        status: newFsStatus,
        prefix: newPriority,
        id: item.id,
        slug: item.slug,
        kind: item.kind,
      })
    }
  }

  // For closed items the symlink in done/ / dropped/ has no priority prefix,
  // so the FS snapshot must record null — recording the inherited GH priority
  // would make every subsequent sync re-detect the item as "FS changed".
  const closed = newFsStatus === 'done' || newFsStatus === 'dropped'
  return {
    title: newTitle,
    bodyHash: fs.sha256(newBody),
    status: newFsStatus,
    priorityPrefix: closed ? null : newPriority,
    effort: newEffort,
  }
}

async function run(argv) {
  const apply = argv.includes('--apply')

  const state = await stateLib.read()
  if (!state || !state.items || Object.keys(state.items).length === 0) {
    throw new Error('No sync state found. Run `backlog-sync init` first.')
  }

  process.stdout.write(`Reading filesystem state...\n`)
  const { items: fsItems } = await fs.readState()
  const fsByKey = new Map(fsItems.map((i) => [i.id || i.slug, i]))

  process.stdout.write('Reading GitHub state...\n')
  const ghItems = await ghLib.listProjectItems()
  const ghByItemId = new Map(ghItems.map((i) => [i.id, i]))

  // Bucket items into change categories.
  const onlyFsChanged = []
  const onlyGhChanged = []
  const bothChanged = []
  const newOnFs = []
  const newOnGh = []

  // Items in state.json — check both sides.
  const knownGhItemIds = new Set()
  for (const [key, ist] of Object.entries(state.items)) {
    const fsItem = fsByKey.get(key)
    const ghItem = ghByItemId.get(ist.ghProjectItemId)
    if (!fsItem) {
      // Filesystem item disappeared — treat as deleted; we don't auto-close
      // here, just warn. (Future: prompt.)
      process.stderr.write(`  warning: state has item ${key} but no FS folder; skipping (resolve manually)\n`)
      continue
    }
    if (!ghItem) {
      process.stderr.write(`  warning: state has GH item ${ist.ghProjectItemId} but it's not in the project; skipping\n`)
      continue
    }
    knownGhItemIds.add(ghItem.id)
    const fsCur = fsSnapshot(fsItem)
    const ghCur = ghSnapshot(ghItem)
    const fsChanged = changed(fsCur, ist.lastSyncedFs)
    const ghChanged = changed(ghCur, ist.lastSyncedGh)
    if (fsChanged && ghChanged) bothChanged.push({ key, fsItem, ghItem, fsCur, ghCur, ist })
    else if (fsChanged) onlyFsChanged.push({ key, fsItem, ghItem, fsCur, ghCur, ist })
    else if (ghChanged) onlyGhChanged.push({ key, fsItem, ghItem, fsCur, ghCur, ist })
  }

  // Items not in state — new on either side.
  for (const fsItem of fsItems) {
    const key = fsItem.id || fsItem.slug
    if (!state.items[key]) newOnFs.push(fsItem)
  }
  for (const ghItem of ghItems) {
    if (!knownGhItemIds.has(ghItem.id)) newOnGh.push(ghItem)
  }

  process.stdout.write('\nSync plan:\n')
  process.stdout.write(`  changed only on FS:  ${onlyFsChanged.length} (push to GitHub)\n`)
  process.stdout.write(`  changed only on GH:  ${onlyGhChanged.length} (pull to filesystem)\n`)
  process.stdout.write(`  changed on both:     ${bothChanged.length} (per-item conflict resolution)\n`)
  process.stdout.write(`  new on FS:           ${newOnFs.length} (create on GitHub)\n`)
  process.stdout.write(`  new on GH:           ${newOnGh.length} (create on filesystem)\n`)
  if (onlyFsChanged.length + onlyGhChanged.length + bothChanged.length + newOnFs.length + newOnGh.length === 0) {
    process.stdout.write('\nNothing to sync.\n')
    return
  }
  if (!apply) {
    process.stdout.write('\nDry run. Re-run with --apply to execute.\n')
    return
  }

  const rl = prompt.createReader()
  const newState = { ...state, items: { ...state.items }, lastSync: new Date().toISOString() }

  try {
    for (const c of onlyFsChanged) {
      const { key, fsItem, ghItem, ist } = c
      const newGhSnap = await applyFsToGh({ item: fsItem, ghItem, projItemId: ist.ghProjectItemId, issueId: ist.ghIssueId })
      newState.items[key] = { ...ist, lastSyncedFs: fsSnapshot(fsItem), lastSyncedGh: newGhSnap }
      process.stdout.write(`  pushed FS→GH: ${key} ${fsItem.title}\n`)
    }
    for (const c of onlyGhChanged) {
      const { key, fsItem, ghItem, ist } = c
      const newFsSnap = await applyGhToFs({ item: fsItem, ghItem })
      newState.items[key] = { ...ist, lastSyncedFs: newFsSnap, lastSyncedGh: ghSnapshot(ghItem) }
      process.stdout.write(`  pulled GH→FS: ${key} ${fsItem.title}\n`)
    }
    let quit = false
    for (const c of bothChanged) {
      if (quit) break
      const { key, fsItem, ghItem, fsCur, ghCur, ist } = c
      const choice = await prompt.promptConflict(rl, {
        item: fsItem,
        fsSnapshot: fsCur,
        ghSnapshot: ghCur,
        lastSnapshot: ist.lastSyncedFs,
      })
      if (choice === 'Q') {
        quit = true
        break
      }
      if (choice === 'S') {
        process.stdout.write(`  skipped: ${key}\n`)
        continue
      }
      if (choice === 'A') {
        const newGhSnap = await applyFsToGh({ item: fsItem, ghItem, projItemId: ist.ghProjectItemId, issueId: ist.ghIssueId })
        newState.items[key] = { ...ist, lastSyncedFs: fsSnapshot(fsItem), lastSyncedGh: newGhSnap }
        process.stdout.write(`  resolved (FS wins): ${key}\n`)
      } else if (choice === 'B') {
        const newFsSnap = await applyGhToFs({ item: fsItem, ghItem })
        newState.items[key] = { ...ist, lastSyncedFs: newFsSnap, lastSyncedGh: ghSnapshot(ghItem) }
        process.stdout.write(`  resolved (GH wins): ${key}\n`)
      }
    }
    if (newOnFs.length || newOnGh.length) {
      process.stdout.write('\nNew items detected. Run `backlog-sync init --force` if you want to bulk-create them, or handle individually.\n')
      // For the steady-state case, creating them automatically is reasonable
      // but we err on the side of not surprising the user. Future enhancement.
    }
    await stateLib.write(newState)
    process.stdout.write(`\nUpdated sync state. ${Object.keys(newState.items).length} items tracked.\n`)
  } finally {
    rl.close()
  }
}

module.exports = { run }
