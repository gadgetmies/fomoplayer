'use strict'

const sync = require('./sync')

async function run(argv) {
  // status is a dry-run wrapper around sync (init does its own dry-run via
  // absence of --apply).
  const filtered = argv.filter((a) => a !== '--apply')
  await sync.run(filtered)
}

module.exports = { run }
