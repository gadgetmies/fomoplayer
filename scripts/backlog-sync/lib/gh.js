'use strict'

const { execFile } = require('child_process')
const { promisify } = require('util')
const crypto = require('crypto')

const execFileAsync = promisify(execFile)
const {
  GH_OWNER,
  GH_REPO,
  GH_PROJECT_NUMBER,
  FIELD_BACKLOG_ID,
  FIELD_PRIORITY,
  FIELD_EFFORT,
  FIELD_STATUS,
} = require('./config')

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex')

let projectId = null
let repoId = null
let fieldCache = null // { name -> { id, type, options } }

async function gh(args, { input } = {}) {
  try {
    const { stdout } = await execFileAsync('gh', args, {
      maxBuffer: 64 * 1024 * 1024,
      input,
    })
    return stdout
  } catch (err) {
    const stderr = (err.stderr || '').toString()
    throw new Error(`gh ${args.join(' ')} failed: ${stderr || err.message}`)
  }
}

async function ghJson(args, opts) {
  const out = await gh(args, opts)
  return JSON.parse(out)
}

async function getProjectId() {
  if (projectId) return projectId
  const data = await ghJson(['project', 'view', String(GH_PROJECT_NUMBER), '--owner', GH_OWNER, '--format', 'json'])
  projectId = data.id
  return projectId
}

async function getRepoId() {
  if (repoId) return repoId
  const data = await ghJson([
    'api',
    'graphql',
    '-f',
    `query={ repository(owner: "${GH_OWNER}", name: "${GH_REPO}") { id } }`,
  ])
  repoId = data.data.repository.id
  return repoId
}

async function getFields() {
  if (fieldCache) return fieldCache
  const data = await ghJson([
    'project',
    'field-list',
    String(GH_PROJECT_NUMBER),
    '--owner',
    GH_OWNER,
    '--format',
    'json',
    '--limit',
    '100',
  ])
  fieldCache = {}
  for (const f of data.fields) {
    fieldCache[f.name] = {
      id: f.id,
      type: f.type,
      options: f.options || [],
    }
  }
  return fieldCache
}

// Read all items in the project, including custom field values, body and
// issue updatedAt. Done in a single GraphQL call for efficiency.
async function listProjectItems() {
  const projId = await getProjectId()
  const items = []
  let cursor = null
  for (;;) {
    const after = cursor ? `, after: "${cursor}"` : ''
    const query = `query {
      node(id: "${projId}") {
        ... on ProjectV2 {
          items(first: 100${after}) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              type
              fieldValues(first: 30) {
                nodes {
                  __typename
                  ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { name } } }
                  ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } }
                  ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2FieldCommon { name } } }
                  ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2FieldCommon { name } } }
                }
              }
              content {
                __typename
                ... on Issue {
                  number
                  title
                  body
                  state
                  stateReason
                  url
                  updatedAt
                  closedAt
                  id
                }
                ... on DraftIssue { title body id updatedAt }
              }
            }
          }
        }
      }
    }`
    const out = await gh(['api', 'graphql', '-f', `query=${query}`])
    const data = JSON.parse(out)
    const conn = data.data.node.items
    for (const node of conn.nodes) {
      const fv = {}
      for (const f of node.fieldValues.nodes || []) {
        const name = f.field?.name
        if (!name) continue
        if (f.__typename === 'ProjectV2ItemFieldTextValue') fv[name] = f.text
        else if (f.__typename === 'ProjectV2ItemFieldSingleSelectValue') fv[name] = f.name
        else if (f.__typename === 'ProjectV2ItemFieldNumberValue') fv[name] = f.number
        else if (f.__typename === 'ProjectV2ItemFieldDateValue') fv[name] = f.date
      }
      items.push({
        id: node.id,
        type: node.type,
        fields: fv,
        content: node.content || {},
      })
    }
    if (!conn.pageInfo.hasNextPage) break
    cursor = conn.pageInfo.endCursor
  }
  return items
}

async function createIssue({ title, body, repo }) {
  // Use repo flag if not the default repo.
  const args = ['issue', 'create', '--repo', repo || `${GH_OWNER}/${GH_REPO}`, '--title', title, '--body', body || '']
  // gh issue create prints the URL to stdout.
  const out = await gh(args)
  const url = out.trim().split('\n').pop()
  // Extract issue number from url.
  const m = /\/issues\/(\d+)$/.exec(url)
  const number = m ? parseInt(m[1], 10) : null
  // Get the issue node id.
  const data = await ghJson([
    'api',
    'graphql',
    '-f',
    `query={ repository(owner: "${GH_OWNER}", name: "${GH_REPO}") { issue(number: ${number}) { id } } }`,
  ])
  const issueId = data.data.repository.issue.id
  return { url, number, issueId }
}

async function addItemToProject({ contentId }) {
  const projId = await getProjectId()
  const out = await gh([
    'api',
    'graphql',
    '-f',
    `query=mutation { addProjectV2ItemById(input: { projectId: "${projId}", contentId: "${contentId}" }) { item { id } } }`,
  ])
  return JSON.parse(out).data.addProjectV2ItemById.item.id
}

async function setTextField({ itemId, fieldName, value }) {
  const projId = await getProjectId()
  const fields = await getFields()
  const f = fields[fieldName]
  if (!f) throw new Error(`Unknown field: ${fieldName}`)
  if (value == null) {
    await gh([
      'api',
      'graphql',
      '-f',
      `query=mutation { clearProjectV2ItemFieldValue(input: { projectId: "${projId}", itemId: "${itemId}", fieldId: "${f.id}" }) { projectV2Item { id } } }`,
    ])
    return
  }
  const escaped = JSON.stringify(String(value))
  await gh([
    'api',
    'graphql',
    '-f',
    `query=mutation { updateProjectV2ItemFieldValue(input: { projectId: "${projId}", itemId: "${itemId}", fieldId: "${f.id}", value: { text: ${escaped} } }) { projectV2Item { id } } }`,
  ])
}

async function setSingleSelectField({ itemId, fieldName, optionName }) {
  const projId = await getProjectId()
  const fields = await getFields()
  const f = fields[fieldName]
  if (!f) throw new Error(`Unknown field: ${fieldName}`)
  const opt = f.options.find((o) => o.name === optionName)
  if (!opt) throw new Error(`Unknown option "${optionName}" on field "${fieldName}". Available: ${f.options.map((o) => o.name).join(', ')}`)
  await gh([
    'api',
    'graphql',
    '-f',
    `query=mutation { updateProjectV2ItemFieldValue(input: { projectId: "${projId}", itemId: "${itemId}", fieldId: "${f.id}", value: { singleSelectOptionId: "${opt.id}" } }) { projectV2Item { id } } }`,
  ])
}

async function ensureSingleSelectOption({ fieldName, optionName }) {
  const fields = await getFields()
  const f = fields[fieldName]
  if (!f) throw new Error(`Unknown field: ${fieldName}`)
  const existing = f.options.find((o) => o.name === optionName)
  if (existing) return existing.id
  // Adding an option to a single-select field requires the
  // updateProjectV2Field mutation with the full options list.
  const newOptions = [...f.options.map((o) => ({ name: o.name, color: 'GRAY', description: '' })), { name: optionName, color: 'GRAY', description: '' }]
  const optsJson = JSON.stringify(newOptions).replace(/"/g, '\\"')
  await gh([
    'api',
    'graphql',
    '-f',
    `query=mutation { updateProjectV2SingleSelectField(input: { fieldId: "${f.id}", options: ${JSON.stringify(newOptions).replace(/"/g, '\\"')} }) { projectV2SingleSelectField { id } } }`,
  ])
  fieldCache = null // refresh on next access
  const refreshed = await getFields()
  return refreshed[fieldName].options.find((o) => o.name === optionName).id
}

async function updateIssue({ issueId, title, body }) {
  const parts = []
  if (title != null) parts.push(`title: ${JSON.stringify(title)}`)
  if (body != null) parts.push(`body: ${JSON.stringify(body)}`)
  if (parts.length === 0) return
  await gh([
    'api',
    'graphql',
    '-f',
    `query=mutation { updateIssue(input: { id: "${issueId}", ${parts.join(', ')} }) { issue { id } } }`,
  ])
}

async function closeIssue({ issueId, reason }) {
  // reason: 'COMPLETED' | 'NOT_PLANNED'
  await gh([
    'api',
    'graphql',
    '-f',
    `query=mutation { closeIssue(input: { issueId: "${issueId}", stateReason: ${reason} }) { issue { id } } }`,
  ])
}

async function reopenIssue({ issueId }) {
  await gh([
    'api',
    'graphql',
    '-f',
    `query=mutation { reopenIssue(input: { issueId: "${issueId}" }) { issue { id } } }`,
  ])
}

module.exports = {
  sha256,
  gh,
  ghJson,
  getProjectId,
  getRepoId,
  getFields,
  listProjectItems,
  createIssue,
  addItemToProject,
  setTextField,
  setSingleSelectField,
  ensureSingleSelectOption,
  updateIssue,
  closeIssue,
  reopenIssue,
}
