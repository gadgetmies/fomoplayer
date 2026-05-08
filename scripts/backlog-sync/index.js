#!/usr/bin/env node
'use strict'

const cmd = process.argv[2]
const rest = process.argv.slice(3)

const COMMANDS = {
  init: () => require('./commands/init').run(rest),
  sync: () => require('./commands/sync').run(rest),
  status: () => require('./commands/status').run(rest),
}

if (!cmd || cmd === '-h' || cmd === '--help' || !COMMANDS[cmd]) {
  process.stdout.write(
    [
      'Usage: backlog-sync <subcommand> [options]',
      '',
      'Subcommands:',
      '  init     First-time bidirectional sync. Required when no .sync-state.json',
      '           exists yet. Creates GitHub Issues for filesystem-only items and',
      '           filesystem task folders for GitHub-only items.',
      '  sync     Incremental sync. Detects changes on both sides since the last',
      '           sync; for items changed on only one side, propagates the change',
      '           to the other side. For items changed on both sides, prompts',
      '           interactively for per-item conflict resolution (A=FS, B=GH,',
      '           S=skip, Q=quit).',
      '  status   Dry-run preview. Print the actions sync would take without',
      '           applying any of them.',
      '',
      'Options:',
      '  --apply  (sync, init only) Actually apply changes. Without it, runs in',
      '           dry-run mode and prints the plan.',
      '',
    ].join('\n'),
  )
  process.exit(cmd && cmd !== '-h' && cmd !== '--help' ? 1 : 0)
}

COMMANDS[cmd]().catch((err) => {
  process.stderr.write(`backlog-sync: ${err.message}\n`)
  if (process.env.DEBUG) process.stderr.write(`${err.stack}\n`)
  process.exit(1)
})
