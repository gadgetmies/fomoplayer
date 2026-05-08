'use strict'

const path = require('path')
const fs = require('../lib/fs')
const ghLib = require('../lib/gh')
const stateLib = require('../lib/state')
const slug = require('../lib/slug')
const prompt = require('../lib/prompt')
const {
  GH_OWNER,
  GH_REPO,
  FS_TO_GH_STATUS,
  GH_TO_FS_STATUS,
  GH_CLOSED_REASON_TO_FS,
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
  // Strip the footer and any preceding whitespace.
  return body.slice(0, idx).replace(/\s+$/, '')
}

const ghStatusToFs = (ghStatus, isClosed, stateReason) => {
  if (isClosed) return GH_CLOSED_REASON_TO_FS[stateReason] || 'done'
  return GH_TO_FS_STATUS[ghStatus] || 'todo'
}

const isMemberOfStoryOrEpic = (item, allItems) => {
  // Epic stories: epics/<slug>/<id>-<slug> symlink
  // Story tasks: stories/<id>-<slug>/<id>-<slug> symlink
  // We don't load these symlinks separately during init; instead we rely on
  // the item's status being null + a story/epic existing to link it later.
  return item.status === null && item.kind === 'tasks'
}

async function run(argv) {
  const apply = argv.includes('--apply')

  const existing = await stateLib.read()
  const resuming = existing && Object.keys(existing.items).length > 0 && argv.includes('--resume')
  if (existing && Object.keys(existing.items).length > 0 && !argv.includes('--force') && !resuming) {
    throw new Error(
      `Sync state already exists at backlog/.sync-state.json with ${Object.keys(existing.items).length} items. Use 'backlog-sync sync' for incremental syncs, '--resume' to continue a partial init, or '--force' to re-initialize from scratch (risk of duplicating items).`,
    )
  }

  process.stdout.write('Reading filesystem state...\n')
  const { items: fsItems } = await fs.readState()
  process.stdout.write(`  ${fsItems.length} items in backlog (tasks/stories/epics)\n`)

  process.stdout.write('Reading GitHub Project state...\n')
  const ghItems = await ghLib.listProjectItems()
  process.stdout.write(`  ${ghItems.length} items in Project\n`)

  // Match items by Backlog ID if present (FS pushes set this), otherwise
  // treat as separate items per the user's "no overlap" assertion.
  const ghByBacklogId = new Map()
  for (const item of ghItems) {
    const id = item.fields[FIELD_BACKLOG_ID]
    if (id) ghByBacklogId.set(slug.padId(parseInt(id, 10)), item)
  }
  const fsById = new Map(fsItems.filter((i) => i.id).map((i) => [i.id, i]))

  const fsOnly = fsItems.filter((i) => !i.id || !ghByBacklogId.has(i.id))
  const ghOnly = ghItems.filter((i) => {
    const id = i.fields[FIELD_BACKLOG_ID]
    return !id || !fsById.has(slug.padId(parseInt(id, 10)))
  })
  const matched = fsItems.filter((i) => i.id && ghByBacklogId.has(i.id))

  process.stdout.write(`\nPlan summary:\n`)
  process.stdout.write(`  push to GitHub:    ${fsOnly.length} (FS-only items become Issues)\n`)
  process.stdout.write(`  pull to filesystem: ${ghOnly.length} (GH Issues become task folders)\n`)
  process.stdout.write(`  already linked:    ${matched.length}\n`)
  process.stdout.write('\n')

  if (!apply) {
    process.stdout.write('Dry run. Re-run with --apply to execute.\n')
    return
  }

  const rl = prompt.createReader()
  try {
    if (!argv.includes('--yes')) {
      const ok = await prompt.confirm(rl, `Apply: create ${fsOnly.length} GH issues, ${ghOnly.length} FS task folders?`)
      if (!ok) {
        process.stdout.write('Aborted.\n')
        return
      }
    }

    const newState = resuming ? existing : stateLib.emptyState()
    newState.lastSync = new Date().toISOString()
    const SAVE_EVERY = 5
    let sinceSave = 0
    const periodicSave = async () => {
      sinceSave += 1
      if (sinceSave >= SAVE_EVERY) {
        await stateLib.write(newState)
        sinceSave = 0
      }
    }

    // Track the running max of FS IDs so we can assign new ones to GH-only items.
    const usedIds = new Set(fsItems.map((i) => i.id).filter(Boolean))
    let nextIdCounter = 1
    const allocateId = () => {
      while (usedIds.has(slug.padId(nextIdCounter))) nextIdCounter += 1
      const id = slug.padId(nextIdCounter)
      usedIds.add(id)
      nextIdCounter += 1
      return id
    }

    // 1. Push FS-only items to GitHub.
    process.stdout.write(`\nPushing ${fsOnly.length} FS items to GitHub...\n`)
    let pushed = 0
    for (const item of fsOnly) {
      // Member tasks (no status) skip the project-status step but still
      // become real Issues so they can be referenced.
      const folderRel = path.relative(path.join(__dirname, '..', '..', '..'), item.folder)
      const ghTitle = item.id ? slug.withIdPrefix(item.id, item.title) : item.title
      const issueBody = buildIssueBody({ folderRel, body: item.body })

      const { number, issueId } = await ghLib.createIssue({ title: ghTitle, body: issueBody })
      const projectItemId = await ghLib.addItemToProject({ contentId: issueId })

      // Set custom fields.
      if (item.id) await ghLib.setTextField({ itemId: projectItemId, fieldName: FIELD_BACKLOG_ID, value: item.id })
      if (item.priorityPrefix) await ghLib.setTextField({ itemId: projectItemId, fieldName: FIELD_PRIORITY, value: item.priorityPrefix })
      if (item.effort) await ghLib.setSingleSelectField({ itemId: projectItemId, fieldName: FIELD_EFFORT, optionName: item.effort })

      // Set status. Closed statuses (done/dropped) close the issue and skip
      // the Status field. Member tasks (status === null) get no status set.
      if (item.status === 'done' || item.status === 'dropped') {
        const reason = item.status === 'done' ? 'COMPLETED' : 'NOT_PLANNED'
        await ghLib.closeIssue({ issueId, reason })
      } else if (item.status) {
        const ghStatus = FS_TO_GH_STATUS[item.status]
        if (!ghStatus) {
          process.stderr.write(`  warning: no GH status mapping for FS folder "${item.status}" (item ${item.id || item.slug})\n`)
        } else {
          // Ensure the option exists (Blocked is added on demand).
          await ghLib.ensureSingleSelectOption({ fieldName: FIELD_STATUS, optionName: ghStatus })
          await ghLib.setSingleSelectField({ itemId: projectItemId, fieldName: FIELD_STATUS, optionName: ghStatus })
        }
      }

      newState.items[item.id || item.slug] = {
        fsKind: item.kind,
        fsId: item.id || null,
        fsSlug: item.slug,
        ghIssueId: issueId,
        ghIssueNumber: number,
        ghProjectItemId: projectItemId,
        lastSyncedFs: stateLib.snapshotForState({
          title: item.title,
          bodyHash: item.bodyHash,
          status: item.status,
          priorityPrefix: item.priorityPrefix,
          effort: item.effort,
        }),
        lastSyncedGh: stateLib.snapshotForState({
          // Store canonical (stripped) values so sync's ghSnapshot, which also
          // strips, can compare apples to apples.
          title: item.title,
          bodyHash: ghLib.sha256(item.body),
          status: item.status === 'done' || item.status === 'dropped' ? null : (FS_TO_GH_STATUS[item.status] || null),
          priorityPrefix: item.priorityPrefix,
          effort: item.effort,
        }),
      }
      pushed += 1
      await periodicSave()
      if (pushed % 10 === 0) process.stdout.write(`  ${pushed}/${fsOnly.length}...\n`)
    }
    process.stdout.write(`  ${pushed}/${fsOnly.length} pushed.\n`)

    // 2. Pull GH-only items into the filesystem.
    process.stdout.write(`\nPulling ${ghOnly.length} GH items to filesystem...\n`)
    let pulled = 0
    for (const ghItem of ghOnly) {
      const content = ghItem.content
      if (content?.__typename !== 'Issue') {
        process.stderr.write(`  skipping non-Issue item: ${content?.__typename}\n`)
        continue
      }
      const newId = allocateId()
      const stripped = slug.stripIdPrefix(content.title || '')
      const fsTitle = stripped.title
      const slugStr = slug.titleToSlug(fsTitle)
      const fsBody = stripIssueFooter(content.body)
      const isClosed = content.state === 'CLOSED'
      const stateReason = content.stateReason
      const fsStatus = ghStatusToFs(ghItem.fields[FIELD_STATUS], isClosed, stateReason)
      const priorityPrefix = ghItem.fields[FIELD_PRIORITY] || DEFAULT_PRIORITY_PREFIX
      const effort = ghItem.fields[FIELD_EFFORT] || null

      // Write the task folder.
      await fs.writeItemFolder({
        kind: 'tasks',
        id: newId,
        slug: slugStr,
        title: fsTitle,
        effort,
        created: (content.updatedAt || new Date().toISOString()).slice(0, 10),
        body: fsBody,
      })

      // Create the symlink (member tasks would be detected from GH parent
      // issue field — out of scope for init; default to status folder).
      await fs.createSymlink({
        status: fsStatus,
        prefix: priorityPrefix,
        id: newId,
        slug: slugStr,
        kind: 'tasks',
      })

      // Set the GH custom field with the new Backlog ID so subsequent syncs
      // can match this item.
      await ghLib.setTextField({ itemId: ghItem.id, fieldName: FIELD_BACKLOG_ID, value: newId })
      // Also set Priority if it was missing on GH (so future syncs round-trip cleanly).
      if (!ghItem.fields[FIELD_PRIORITY]) {
        await ghLib.setTextField({ itemId: ghItem.id, fieldName: FIELD_PRIORITY, value: priorityPrefix })
      }
      // Update the issue title to include the id prefix for human readability.
      const newGhTitle = slug.withIdPrefix(newId, fsTitle)
      if (newGhTitle !== content.title) {
        await ghLib.updateIssue({ issueId: content.id, title: newGhTitle })
      }
      // Append a footer to the issue body if missing.
      const newIssueBody = buildIssueBody({ folderRel: path.join('backlog', 'tasks', `${newId}-${slugStr}`), body: fsBody })
      if (!content.body || !content.body.includes(FOOTER_MARKER)) {
        await ghLib.updateIssue({ issueId: content.id, body: newIssueBody })
      }

      newState.items[newId] = {
        fsKind: 'tasks',
        fsId: newId,
        fsSlug: slugStr,
        ghIssueId: content.id,
        ghIssueNumber: content.number,
        ghProjectItemId: ghItem.id,
        lastSyncedFs: stateLib.snapshotForState({
          title: fsTitle,
          bodyHash: fs.sha256(fsBody),
          status: fsStatus,
          priorityPrefix,
          effort,
        }),
        lastSyncedGh: stateLib.snapshotForState({
          // Store canonical (stripped) values so future syncs compare cleanly.
          title: fsTitle,
          bodyHash: ghLib.sha256(fsBody),
          status: ghItem.fields[FIELD_STATUS] || null,
          priorityPrefix,
          effort,
        }),
      }
      pulled += 1
      await periodicSave()
      if (pulled % 10 === 0) process.stdout.write(`  ${pulled}/${ghOnly.length}...\n`)
    }
    process.stdout.write(`  ${pulled}/${ghOnly.length} pulled.\n`)

    await stateLib.write(newState)
    process.stdout.write(`\nWrote sync state with ${Object.keys(newState.items).length} items.\n`)
    process.stdout.write('Done.\n')
  } finally {
    rl.close()
  }
}

module.exports = { run }
