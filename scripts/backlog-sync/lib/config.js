'use strict'

const path = require('path')

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const BACKLOG_DIR = path.join(REPO_ROOT, 'backlog')
const STATE_FILE = path.join(BACKLOG_DIR, '.sync-state.json')

const GH_OWNER = 'gadgetmies'
const GH_REPO = 'fomoplayer'
const GH_PROJECT_NUMBER = 2

// Status folders on the filesystem (must exist as directories under backlog/).
// Order matters for display only.
const FS_OPEN_STATUSES = [
  'todo',
  'not-prioritized',
  'in-progress',
  'blocked',
  'to-be-verified',
  'validated',
  'in-production',
]
const FS_CLOSED_STATUSES = ['done', 'dropped']
const FS_ALL_STATUSES = [...FS_OPEN_STATUSES, ...FS_CLOSED_STATUSES]

// Bidirectional mapping between FS folders and GH Project Status options.
// `done` and `dropped` map to closed issues with state_reason rather than a
// status option (the GitHub Project doesn't have those as status values).
const FS_TO_GH_STATUS = {
  todo: 'Backlog',
  'not-prioritized': 'Not prioritized',
  'in-progress': 'In progress',
  blocked: 'Blocked', // Created on demand if any item lands here.
  'to-be-verified': 'To be verified',
  validated: 'Validated',
  'in-production': 'In production / to be monitored',
}

const GH_TO_FS_STATUS = Object.fromEntries(
  Object.entries(FS_TO_GH_STATUS).map(([fs, gh]) => [gh, fs]),
)

// FS folder for closed issues by GitHub state_reason.
const GH_CLOSED_REASON_TO_FS = {
  COMPLETED: 'done',
  NOT_PLANNED: 'dropped',
  REOPENED: null, // shouldn't appear on closed issues, but defensive
}

const FS_CLOSED_TO_GH_REASON = {
  done: 'COMPLETED',
  dropped: 'NOT_PLANNED',
}

// GH custom field names we manage.
const FIELD_BACKLOG_ID = 'Backlog ID'
const FIELD_PRIORITY = 'Priority'
const FIELD_EFFORT = 'Effort'
const FIELD_STATUS = 'Status'

// Default priority prefix for items pulled from GH that don't have one set.
const DEFAULT_PRIORITY_PREFIX = 'm'

module.exports = {
  REPO_ROOT,
  BACKLOG_DIR,
  STATE_FILE,
  GH_OWNER,
  GH_REPO,
  GH_PROJECT_NUMBER,
  FS_OPEN_STATUSES,
  FS_CLOSED_STATUSES,
  FS_ALL_STATUSES,
  FS_TO_GH_STATUS,
  GH_TO_FS_STATUS,
  GH_CLOSED_REASON_TO_FS,
  FS_CLOSED_TO_GH_REASON,
  FIELD_BACKLOG_ID,
  FIELD_PRIORITY,
  FIELD_EFFORT,
  FIELD_STATUS,
  DEFAULT_PRIORITY_PREFIX,
}
