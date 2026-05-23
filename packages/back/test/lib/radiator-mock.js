// Seeding helpers for the admin Radiator demo tests.
//
// The Radiator view charts the results of the radiator SQL jobs
// (jobs/radiator/queries/*.sql) recorded as job_run rows, picked via a saved
// radiator_config preset. Track data comes from the shared, reset-safe
// seedTracks helper (Beatport fixtures); these helpers add the presets and the
// job_run rows on top — either directly via pg (local) or through the admin
// API (preview), so the same browser steps can assert against both.

const fs = require('fs')
const path = require('path')
const sql = require('sql-template-strings')
const { pg } = require('./db')

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
]

const ADDED_TRACKS_JOB = 'added-tracks-by-store.sql'

// ── Local: seed straight into the database ───────────────────────────────────

module.exports.seedRadiatorPresetsViaDb = async () => {
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

module.exports.runRadiatorJobsViaDb = async () => {
  const query = fs.readFileSync(path.join(QUERIES_DIR, ADDED_TRACKS_JOB), 'utf8')
  await pg.queryAsync(sql`INSERT INTO job (job_name) VALUES (${ADDED_TRACKS_JOB}) ON CONFLICT DO NOTHING`)
  const result = await pg.queryRowsAsync(query)
  await pg.queryAsync(sql`
    INSERT INTO job_run (job_id, job_run_ended, job_run_success, job_run_result)
    SELECT job_id, NOW(), TRUE, ${JSON.stringify(result)}
    FROM job WHERE job_name = ${ADDED_TRACKS_JOB}
  `)
}

// ── Preview: seed through the admin API (requires an admin session) ──────────

module.exports.seedRadiatorPresetsViaApi = async (page) => {
  for (const { name, lens, config } of radiatorPresets) {
    const res = await page.request.post('/api/admin/radiator/config', { data: { name, lens, config } })
    if (!res.ok()) {
      throw new Error(
        `POST /api/admin/radiator/config failed: HTTP ${res.status()} — ${await res.text()}. ` +
          'The session user must be an admin (ADMIN_USER_IDS) on the target environment.',
      )
    }
  }
}

module.exports.runRadiatorJobsViaApi = async (page) => {
  const res = await page.request.post(`/api/admin/jobs/${ADDED_TRACKS_JOB}/run`)
  if (!res.ok()) {
    throw new Error(
      `POST /api/admin/jobs/${ADDED_TRACKS_JOB}/run failed: HTTP ${res.status()} — ${await res.text()}. ` +
        'The session user must be an admin (ADMIN_USER_IDS) on the target environment.',
    )
  }
}

module.exports.radiatorPresetNames = radiatorPresets.map(({ name }) => name)
module.exports.ADDED_TRACKS_JOB = ADDED_TRACKS_JOB
