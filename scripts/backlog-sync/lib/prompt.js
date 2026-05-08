'use strict'

const readline = require('readline')

function createReader() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer)))
}

// Prompt the user to resolve a per-item conflict. Returns 'A' (FS wins),
// 'B' (GH wins), 'S' (skip), or 'Q' (quit).
async function promptConflict(rl, { item, fsSnapshot, ghSnapshot, lastSnapshot }) {
  const lines = []
  lines.push('')
  lines.push('─'.repeat(78))
  lines.push(`CONFLICT: ${item.id || ''} ${item.title || '(no title)'}`)
  lines.push('Both sides changed since last sync.')
  lines.push('─'.repeat(78))
  const fields = ['title', 'status', 'priorityPrefix', 'effort', 'bodyHash']
  const labels = { title: 'title', status: 'status', priorityPrefix: 'priority', effort: 'effort', bodyHash: 'body' }
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n)
  lines.push(`${pad('field', 12)} ${pad('FILESYSTEM', 30)} ${pad('GITHUB', 30)}`)
  for (const f of fields) {
    const fsv = fsSnapshot?.[f]
    const ghv = ghSnapshot?.[f]
    const lastv = lastSnapshot?.[f]
    const fsChanged = (fsv ?? '') !== (lastv ?? '')
    const ghChanged = (ghv ?? '') !== (lastv ?? '')
    if (!fsChanged && !ghChanged) continue
    const fsCell = f === 'bodyHash' ? `[hash ${(fsv || '').slice(0, 8)}]${fsChanged ? ' *' : ''}` : `${fsv ?? '∅'}${fsChanged ? ' *' : ''}`
    const ghCell = f === 'bodyHash' ? `[hash ${(ghv || '').slice(0, 8)}]${ghChanged ? ' *' : ''}` : `${ghv ?? '∅'}${ghChanged ? ' *' : ''}`
    lines.push(`${pad(labels[f], 12)} ${pad(fsCell, 30)} ${pad(ghCell, 30)}`)
  }
  lines.push('─'.repeat(78))
  lines.push('[A] FS wins (push FS values to GH)')
  lines.push('[B] GH wins (pull GH values to FS)')
  lines.push('[S] Skip (leave both sides as-is, do not update sync state)')
  lines.push('[Q] Quit (apply nothing further this run)')
  lines.push('')
  process.stdout.write(`${lines.join('\n')}\n`)
  for (;;) {
    const ans = (await ask(rl, '> ')).trim().toUpperCase()
    if (['A', 'B', 'S', 'Q'].includes(ans)) return ans
    process.stdout.write('Please enter A, B, S, or Q.\n')
  }
}

async function confirm(rl, question) {
  const ans = (await ask(rl, `${question} [y/N] `)).trim().toLowerCase()
  return ans === 'y' || ans === 'yes'
}

module.exports = { createReader, ask, promptConflict, confirm }
