'use strict'

const fsp = require('fs/promises')
const { STATE_FILE } = require('./config')

async function read() {
  try {
    const content = await fsp.readFile(STATE_FILE, 'utf8')
    return JSON.parse(content)
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

async function write(state) {
  const sorted = {
    version: state.version || 1,
    lastSync: state.lastSync,
    items: Object.fromEntries(
      Object.entries(state.items || {}).sort(([a], [b]) => a.localeCompare(b)),
    ),
  }
  await fsp.writeFile(STATE_FILE, `${JSON.stringify(sorted, null, 2)}\n`)
}

function emptyState() {
  return { version: 1, lastSync: null, items: {} }
}

function snapshotForState({ title, bodyHash, status, priorityPrefix, effort }) {
  return { title, bodyHash, status: status || null, priorityPrefix: priorityPrefix || null, effort: effort || null }
}

module.exports = { read, write, emptyState, snapshotForState }
