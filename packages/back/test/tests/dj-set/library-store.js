const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { test } = require('cascade-test')
const { scanTdb } = require('../../../scripts/dj-set/lib/library-store.js')

test({
  'keeps only the wanted hashes with positions in seconds': () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'library-store-'))
    const file = path.join(dir, '42.tdb')
    // hash resourceId t1(blocks of 128 samples at 16 kHz) f1
    fs.writeFileSync(file, '1234567890123 42 125 7\n99 42 250 8\n1234567890123 42 1250 9\n')
    const rows = scanTdb(file, new Set(['1234567890123']))
    assert.deepStrictEqual(rows, [
      ['1234567890123', '42', 1],
      ['1234567890123', '42', 10],
    ])
    fs.rmSync(dir, { recursive: true })
  },
})
