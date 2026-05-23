// Test-only seeding for the admin Radiator view.
//
// The Radiator page charts the results of the radiator SQL jobs
// (jobs/radiator/queries/*.sql), which read real tables (track, store__track,
// cart, user__track, ...). On an empty database those queries return nothing
// and the view looks broken. This helper inserts a small set of rows into the
// actual tables, runs each radiator query, and records the results as job_run
// rows — the same source the page reads via GET /api/admin/radiator — plus a
// couple of ready-to-use radiator_config presets so a chart renders as soon as
// one is picked from the "Load radiator" dropdown.

const fs = require('fs')
const path = require('path')
const BPromise = require('bluebird')
const sql = require('sql-template-strings')
const { pg } = require('./db')

const MARKER = 'MOCK_RADIATOR'
const TRACK_COUNT = 18
// Matches the prefix tracks-with-generated-waveforms.sql treats as "generated".
const GENERATED_WAVEFORM_PREFIX = 'https://bucket-production-4c34.up.railway.app'
const QUERIES_DIR = path.resolve(__dirname, '../../jobs/radiator/queries')

const radiatorPresets = [
  {
    name: 'Added tracks by store',
    lens: `[
  L.elems,
  L.when(x => x.job_name === 'added-tracks-by-store.sql'),
  'results',
  L.elems,
  L.when(r => r.success),
  L.choose(r => ['result', L.elems, L.getter(row => ({ time: r.started.slice(0, 10), label: row.store_name, value: Number(row.count) }))])
]`,
    config: JSON.stringify(
      {
        type: 'bar',
        options: { responsive: true, plugins: { legend: { position: 'top' }, title: { display: true, text: 'Added tracks by store' } } },
      },
      null,
      2,
    ),
  },
  {
    name: 'Heard tracks by users',
    lens: `[
  L.elems,
  L.when(x => x.job_name === 'heard-tracks-by-users.sql'),
  'results',
  L.first,
  L.when(r => r.success),
  L.choose(r => ['result', L.elems, L.getter(row => ({ time: row.date, label: 'User ' + row.userId, value: Number(row.count) }))])
]`,
    config: JSON.stringify(
      {
        type: 'bar',
        options: { responsive: true, plugins: { legend: { position: 'top' }, title: { display: true, text: 'Heard tracks by users' } } },
      },
      null,
      2,
    ),
  },
]

const seedPresets = async () => {
  for (const { name, lens, config } of radiatorPresets) {
    await pg.queryAsync(sql`
      INSERT INTO radiator_config (radiator_config_name, radiator_config_lens, radiator_config_config)
      VALUES (${name}, ${lens}, ${config})
      ON CONFLICT (radiator_config_name) DO UPDATE
        SET radiator_config_lens = EXCLUDED.radiator_config_lens,
            radiator_config_config = EXCLUDED.radiator_config_config
    `)
  }
}

const seedRows = async () => {
  const zeroVector = `[${new Array(1280).fill(0).join(',')}]`

  await BPromise.using(pg.getTransaction(), async (tx) => {
    const users = []
    for (let i = 0; i < 3; i++) {
      const [{ id }] = await tx.queryRowsAsync(sql`
        INSERT INTO meta_account (meta_account_details) VALUES ('{"mock": true}') RETURNING meta_account_user_id AS id
      `)
      const [{ cart_id }] = await tx.queryRowsAsync(sql`
        INSERT INTO cart (cart_name, meta_account_user_id, cart_is_default)
        VALUES (${`${MARKER} cart`}, ${id}, TRUE) RETURNING cart_id
      `)
      users.push({ userId: id, cartId: cart_id })
    }

    for (let i = 0; i < TRACK_COUNT; i++) {
      const storeId = i % 2 === 0 ? 1 : 2 // 1 = Beatport, 2 = Bandcamp
      const isBandcamp = storeId === 2

      const [{ track_id }] = await tx.queryRowsAsync(sql`
        INSERT INTO track (track_title) VALUES (${`${MARKER} Track ${i + 1}`}) RETURNING track_id
      `)
      const [{ store__track_id }] = await tx.queryRowsAsync(sql`
        INSERT INTO store__track (track_id, store_id, store__track_store_id, store__track_store_details)
        VALUES (${track_id}, ${storeId}, ${`${MARKER}-${i}`}, '{}') RETURNING store__track_id
      `)

      const previewUrl = isBandcamp ? null : `https://example.com/preview/${i}.mp3`
      const missing = i % 7 === 0
      const [{ store__track_preview_id }] = await tx.queryRowsAsync(sql`
        INSERT INTO store__track_preview
          (store__track_id, store__track_preview_url, store__track_preview_format, store__track_preview_missing)
        VALUES (${store__track_id}, ${previewUrl}, 'mp3', ${missing}) RETURNING store__track_preview_id
      `)

      if (isBandcamp && i % 3 === 0) {
        await tx.queryAsync(sql`
          INSERT INTO store__track_preview_waveform (store__track_preview_id, store__track_preview_waveform_url)
          VALUES (${store__track_preview_id}, ${`${GENERATED_WAVEFORM_PREFIX}/waveforms/${i}.json`})
        `)
      }

      if (i % 4 === 0) {
        await tx.queryAsync(sql`
          INSERT INTO store__track_preview_embedding
            (store__track_preview_id, store__track_preview_embedding, store__track_preview_embedding_type)
          VALUES (${store__track_preview_id}, ${zeroVector}, 'discogs_artist_embeddings-effnet-bs64-1')
        `)
      }

      const { userId, cartId } = users[i % users.length]
      await tx.queryAsync(sql`INSERT INTO track__cart (cart_id, track_id) VALUES (${cartId}, ${track_id})`)
      await tx.queryAsync(sql`
        INSERT INTO user__track (track_id, meta_account_user_id, user__track_heard)
        VALUES (${track_id}, ${userId}, NOW())
      `)
    }
  })
}

const runRadiatorJobs = async () => {
  for (const file of fs.readdirSync(QUERIES_DIR)) {
    if (!file.endsWith('.sql')) continue
    const query = fs.readFileSync(path.join(QUERIES_DIR, file), 'utf8')
    await pg.queryAsync(sql`INSERT INTO job (job_name) VALUES (${file}) ON CONFLICT DO NOTHING`)

    let result
    let success
    try {
      result = await pg.queryRowsAsync(query)
      success = true
    } catch (e) {
      result = { error: e.message }
      success = false
    }
    const stored = typeof result === 'object' ? result : { result }
    await pg.queryAsync(sql`
      INSERT INTO job_run (job_id, job_run_ended, job_run_success, job_run_result)
      SELECT job_id, NOW(), ${success}, ${JSON.stringify(stored)}
      FROM job WHERE job_name = ${file}
    `)
  }
}

module.exports.seedRadiatorMockData = async () => {
  await seedPresets()
  await seedRows()
  await runRadiatorJobs()
}

module.exports.radiatorPresetNames = radiatorPresets.map(({ name }) => name)
