const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')

const { initDb, pg } = require('../../lib/db')
const { prefetchPreviewAudio, createPauses } = require('../../../jobs/prefetch-preview-audio')
const { releaseAnalysedPreviewAudio, PRODUCTION_EMBEDDING_TYPE } = require('../../../routes/admin/preview-audio')
const {
  queryPreviewsWithoutFingerprint,
  queryTracksWithoutWaveform,
  queryNextTracksToAnalyse,
} = require('../../../routes/admin/db')

const BUCKET = 'storage'
const STORE_IDS = { Beatport: 1, Bandcamp: 2 }

// A fake storage bucket keeping what is put into it.
const fakeClient = () => {
  const objects = {}
  return {
    objects,
    putObject: async (bucket, key, stream) => {
      const chunks = []
      for await (const chunk of stream) chunks.push(chunk)
      objects[`${bucket}/${key}`] = Buffer.concat(chunks)
    },
    removeObject: async (bucket, key) => {
      delete objects[`${bucket}/${key}`]
    },
  }
}

// A fake fetch answering each URL with the given status (200 bodies are the URL itself), recording the requests.
const fakeFetch = (responses) => {
  const requests = []
  const fetch = async (url) => {
    requests.push(url)
    const answer = responses[url]
    const status = typeof answer === 'function' ? answer() : answer
    if (status === undefined) throw new Error(`Unexpected request to ${url}`)
    return new Response(status === 200 ? `audio of ${url}` : 'error', { status })
  }
  return { fetch, requests }
}

const fakeBandcamp = (releases) => {
  const lookups = []
  return {
    lookups,
    getRelease: async (url) => {
      lookups.push(url)
      const release = typeof releases[url] === 'function' ? releases[url]() : releases[url]
      if (!release) throw Object.assign(new Error('Not found'), { statusCode: 404 })
      return release
    },
  }
}

const release = (tracks) => ({
  trackinfo: Object.entries(tracks).map(([track_id, stream]) => ({
    track_id: Number(track_id),
    file: stream ? { 'mp3-128': stream } : null,
  })),
})

let counter = 0
const created = { previews: [], tracks: [], releases: [] }
const insertPreview = async ({ store, url = null, releaseUrl = null }) => {
  counter++
  const storeTrackId = String(900000 + counter)
  const [{ track_id }] = await pg.queryRowsAsync(
    sql`INSERT INTO track (track_title) VALUES (${`Prefetch track ${counter}`}) RETURNING track_id`,
  )
  created.tracks.push(track_id)
  const [{ store__track_id }] = await pg.queryRowsAsync(
    sql`INSERT INTO store__track (track_id, store_id, store__track_store_id, store__track_url)
        VALUES (${track_id}, ${STORE_IDS[store]}, ${storeTrackId}, ${`https://example.com/track/${counter}`})
        RETURNING store__track_id`,
  )
  const [{ preview_id }] = await pg.queryRowsAsync(
    sql`INSERT INTO store__track_preview (store__track_id, store__track_preview_url, store__track_preview_format)
        VALUES (${store__track_id}, ${url}, 'mp3')
        RETURNING store__track_preview_id AS preview_id`,
  )
  created.previews.push(preview_id)
  if (releaseUrl) {
    let [existing] = await pg.queryRowsAsync(
      sql`SELECT release_id FROM store__release WHERE store__release_url = ${releaseUrl}`,
    )
    if (!existing) {
      ;[existing] = await pg.queryRowsAsync(
        sql`INSERT INTO release (release_name) VALUES (${`Release ${releaseUrl}`}) RETURNING release_id`,
      )
      created.releases.push(existing.release_id)
      await pg.queryAsync(
        sql`INSERT INTO store__release (release_id, store_id, store__release_store_id, store__release_url)
            VALUES (${existing.release_id}, ${STORE_IDS[store]}, ${`release-${counter}`}, ${releaseUrl})`,
      )
    }
    const { release_id } = existing
    await pg.queryAsync(sql`INSERT INTO release__track (release_id, track_id) VALUES (${release_id}, ${track_id})`)
  }
  return { id: preview_id, storeTrackId }
}

// Every scenario starts from previews of its own: the ones left by earlier scenarios are taken out of the queues.
const clearPreviews = async () => {
  await pg.queryAsync(sql`UPDATE store__track_preview SET store__track_preview_missing = TRUE`)
  await pg.queryAsync(sql`DELETE FROM store__track_preview_audio`)
}

const audioRow = async (previewId) =>
  (
    await pg.queryRowsAsync(
      sql`SELECT store__track_preview_audio_object_key AS key
               , store__track_preview_audio_file_size AS size
               , store__track_preview_audio_failed_attempts AS attempts
          FROM store__track_preview_audio WHERE store__track_preview_id = ${previewId}`,
    )
  )[0]

const isMissing = async (previewId) =>
  (
    await pg.queryRowsAsync(
      sql`SELECT store__track_preview_missing AS missing FROM store__track_preview
          WHERE store__track_preview_id = ${previewId}`,
    )
  )[0].missing

const addFingerprint = (previewId) =>
  pg.queryAsync(
    sql`INSERT INTO store__track_preview_fingerprint_meta (store__track_preview_id, store__track_preview_fingerprint_count)
        VALUES (${previewId}, 10)`,
  )
const addEmbedding = (previewId) =>
  pg.queryAsync(
    sql`INSERT INTO store__track_preview_embedding
          (store__track_preview_id, store__track_preview_embedding_type, store__track_preview_embedding)
        VALUES (${previewId}, ${PRODUCTION_EMBEDDING_TYPE}, ${`[${new Array(1280).fill(0.1).join(',')}]`})`,
  )
const addWaveform = (previewId) =>
  pg.queryAsync(
    sql`INSERT INTO store__track_preview_waveform (store__track_preview_id, store__track_preview_waveform_url)
        VALUES (${previewId}, '/api/storage/waveforms/x.png')`,
  )

// Bandcamp streams are fetched with the same fake as the other stores unless a test passes its own.
const run = (options) =>
  prefetchPreviewAudio(
    { id: 1 },
    {
      bucketName: BUCKET,
      isBandcampRateLimited: () => false,
      getKnownStreamUrl: async () => null,
      fetchBandcampStream: options.fetch,
      suspendBandcamp: () => {},
      storePauses: createPauses(),
      downloadIntervalMs: 0,
      isPreviewEnv: false,
      ...options,
    },
  )

test({
  setup: async () => {
    await initDb()
  },

  // Leaves no rows behind: a later initDb reset cannot remove previews that still have waveforms.
  teardown: async () => {
    const { previews, tracks, releases } = created
    await pg.queryAsync(
      sql`DELETE FROM store__track_preview_waveform WHERE store__track_preview_id = ANY (${previews})`,
    )
    await pg.queryAsync(
      sql`DELETE FROM store__track_preview_embedding WHERE store__track_preview_id = ANY (${previews})`,
    )
    await pg.queryAsync(
      sql`DELETE FROM store__track_preview_fingerprint_meta WHERE store__track_preview_id = ANY (${previews})`,
    )
    await pg.queryAsync(sql`DELETE FROM store__track_preview WHERE store__track_preview_id = ANY (${previews})`)
    await pg.queryAsync(sql`DELETE FROM release__track WHERE release_id = ANY (${releases})`)
    await pg.queryAsync(sql`DELETE FROM store__release WHERE release_id = ANY (${releases})`)
    await pg.queryAsync(sql`DELETE FROM release WHERE release_id = ANY (${releases})`)
    await pg.queryAsync(sql`DELETE FROM store__track WHERE track_id = ANY (${tracks})`)
    await pg.queryAsync(sql`DELETE FROM track WHERE track_id = ANY (${tracks})`)
  },

  'the job is registered and runs every 10 minutes': async () => {
    const [job] = await pg.queryRowsAsync(
      sql`SELECT job_enabled AS enabled, job_schedule AS schedule
          FROM job NATURAL LEFT JOIN job_schedule WHERE job_name = 'prefetchPreviewAudio'`,
    )
    assert.deepStrictEqual(job, { enabled: true, schedule: '*/10 * * * *' })
  },

  'preview environments download nothing': async () => {
    const { fetch, requests } = fakeFetch({})
    const result = await prefetchPreviewAudio(
      { id: 1 },
      { client: fakeClient(), bucketName: BUCKET, fetch, isPreviewEnv: true },
    )
    assert.deepStrictEqual(result, { success: true, result: { skipped: 'Not run in preview environments' } })
    assert.deepStrictEqual(requests, [])
  },

  'without storage the run fails and says why': async () => {
    const result = await prefetchPreviewAudio({ id: 1 }, { client: null, bucketName: null, isPreviewEnv: false })
    assert.deepStrictEqual(result, { success: false, result: { error: 'Object storage is not configured' } })
  },

  'a run over Beatport and Bandcamp previews': {
    setup: async () => {
      await clearPreviews()
      const beatport = await insertPreview({ store: 'Beatport', url: 'https://bp.example/stored.mp3' })
      const gone = await insertPreview({ store: 'Beatport', url: 'https://bp.example/gone.mp3' })
      const failing = await insertPreview({ store: 'Beatport', url: 'https://bp.example/failing.mp3' })
      const first = await insertPreview({ store: 'Bandcamp', releaseUrl: 'https://artist.bandcamp.com/album/one' })
      const second = await insertPreview({ store: 'Bandcamp', releaseUrl: 'https://artist.bandcamp.com/album/one' })
      const unstreamed = await insertPreview({ store: 'Bandcamp', releaseUrl: 'https://artist.bandcamp.com/album/two' })
      const withoutRelease = await insertPreview({ store: 'Bandcamp' })

      const client = fakeClient()
      const { fetch, requests } = fakeFetch({
        'https://bp.example/stored.mp3': 200,
        'https://bp.example/gone.mp3': 404,
        'https://bp.example/failing.mp3': 500,
        'https://bcbits.example/first': 200,
        'https://bcbits.example/second': 200,
      })
      const bandcamp = fakeBandcamp({
        'https://artist.bandcamp.com/album/one': release({
          [first.storeTrackId]: 'https://bcbits.example/first',
          [second.storeTrackId]: 'https://bcbits.example/second',
        }),
        'https://artist.bandcamp.com/album/two': release({ [unstreamed.storeTrackId]: null }),
      })
      const result = await run({ client, fetch, getRelease: bandcamp.getRelease })
      return { beatport, gone, failing, first, second, unstreamed, withoutRelease, client, requests, bandcamp, result }
    },

    'reports what it did': async ({ result }) => {
      assert.strictEqual(result.success, true)
      assert.deepStrictEqual(
        { ...result.result, rateLimited: undefined },
        { released: 0, stored: 3, missing: 2, failed: 1, lookups: 2, rateLimited: undefined, capReached: false },
      )
    },

    'stores each audio under a random preview-audio key': async ({ beatport, first, second, client }) => {
      for (const [preview, url] of [
        [beatport, 'https://bp.example/stored.mp3'],
        [first, 'https://bcbits.example/first'],
        [second, 'https://bcbits.example/second'],
      ]) {
        const row = await audioRow(preview.id)
        assert.match(row.key, /^preview-audio\/[0-9a-f-]{36}\.mp3$/)
        assert.strictEqual(client.objects[`${BUCKET}/${row.key}`].toString(), `audio of ${url}`)
        assert.strictEqual(Number(row.size), `audio of ${url}`.length)
      }
    },

    'looks each Bandcamp release up once': async ({ bandcamp }) => {
      assert.deepStrictEqual(bandcamp.lookups.sort(), [
        'https://artist.bandcamp.com/album/one',
        'https://artist.bandcamp.com/album/two',
      ])
    },

    'marks gone and unstreamed previews missing': async ({ gone, unstreamed }) => {
      assert.strictEqual(await isMissing(gone.id), true)
      assert.strictEqual(await isMissing(unstreamed.id), true)
    },

    'records a failed download for a retry later': async ({ failing }) => {
      assert.strictEqual(await isMissing(failing.id), false)
      assert.deepStrictEqual(await audioRow(failing.id), { key: null, size: null, attempts: 1 })
    },

    'skips Bandcamp previews without a release page': async ({ withoutRelease }) => {
      assert.strictEqual(await audioRow(withoutRelease.id), undefined)
      assert.strictEqual(await isMissing(withoutRelease.id), false)
    },

    'the fingerprint queue serves stored audio only when asked to': async ({ beatport, failing, first }) => {
      const stored = await queryPreviewsWithoutFingerprint(100, 'stored')
      const key = (await audioRow(beatport.id)).key
      assert.deepStrictEqual(
        stored.find(({ preview_id }) => Number(preview_id) === beatport.id).audio_url,
        `/api/storage/${key}`,
      )
      assert.ok(stored.some(({ preview_id }) => Number(preview_id) === first.id))
      assert.ok(!stored.some(({ preview_id }) => Number(preview_id) === failing.id))

      const all = await queryPreviewsWithoutFingerprint(100)
      assert.strictEqual(all.find(({ preview_id }) => Number(preview_id) === failing.id).audio_url, null)
    },

    'the waveform and embedding queues serve stored audio': async ({ first, failing }) => {
      const key = (await audioRow(first.id)).key
      const waveforms = await queryTracksWithoutWaveform(100, ['Bandcamp'], 'stored')
      assert.deepStrictEqual(
        waveforms
          .map(({ preview_id, audio_url }) => ({ preview_id: Number(preview_id), audio_url }))
          .find(({ preview_id }) => preview_id === first.id),
        { preview_id: first.id, audio_url: `/api/storage/${key}` },
      )

      const tracks = await queryNextTracksToAnalyse({
        model: PRODUCTION_EMBEDDING_TYPE,
        batch_size: 100,
        audio: 'stored',
      })
      const previews = tracks.flatMap(({ previews }) => previews)
      assert.strictEqual(
        previews.find(({ preview_id }) => Number(preview_id) === first.id).audio_url,
        `/api/storage/${key}`,
      )
      assert.ok(!previews.some(({ preview_id }) => Number(preview_id) === failing.id))
    },

    'the next run does not retry the failed download yet': async ({ client }) => {
      const { fetch, requests } = fakeFetch({})
      const result = await run({ client, fetch, getRelease: fakeBandcamp({}).getRelease })
      assert.deepStrictEqual(requests, [])
      assert.strictEqual(result.result.stored, 0)
    },

    'releasing audio': {
      'keeps it while an analysis is missing': async ({ beatport, client }) => {
        await addFingerprint(beatport.id)
        const released = await releaseAnalysedPreviewAudio({ client, bucketName: BUCKET, previewIds: [beatport.id] })
        assert.strictEqual(released, 0)
        assert.ok((await audioRow(beatport.id)).key)
      },

      'removes it after the last analysis of a Beatport preview': async ({ beatport, client }) => {
        const { key } = await audioRow(beatport.id)
        await addEmbedding(beatport.id)
        const released = await releaseAnalysedPreviewAudio({ client, bucketName: BUCKET, previewIds: [beatport.id] })
        assert.strictEqual(released, 1)
        assert.strictEqual(await audioRow(beatport.id), undefined)
        assert.strictEqual(client.objects[`${BUCKET}/${key}`], undefined)
      },

      'waits for the waveform of a Bandcamp preview': async ({ first, client }) => {
        const { key } = await audioRow(first.id)
        await addFingerprint(first.id)
        await addEmbedding(first.id)
        assert.strictEqual(await releaseAnalysedPreviewAudio({ client, bucketName: BUCKET, previewIds: [first.id] }), 0)
        await addWaveform(first.id)
        assert.strictEqual(await releaseAnalysedPreviewAudio({ client, bucketName: BUCKET, previewIds: [first.id] }), 1)
        assert.strictEqual(client.objects[`${BUCKET}/${key}`], undefined)
      },

      'a run first releases the audio of previews marked missing': async ({ second, client }) => {
        const { key } = await audioRow(second.id)
        await pg.queryAsync(
          sql`UPDATE store__track_preview SET store__track_preview_missing = TRUE
              WHERE store__track_preview_id = ${second.id}`,
        )
        const result = await run({ client, fetch: fakeFetch({}).fetch, getRelease: fakeBandcamp({}).getRelease })
        assert.ok(result.result.released >= 1)
        assert.strictEqual(client.objects[`${BUCKET}/${key}`], undefined)
      },
    },
  },

  'a rate limit stops and pauses the store': async () => {
    await clearPreviews()
    // Newest first: the preview inserted last is downloaded first.
    await insertPreview({ store: 'Beatport', url: 'https://bp.example/after-limit.mp3' })
    const limited = await insertPreview({ store: 'Beatport', url: 'https://bp.example/limited.mp3' })
    const { fetch, requests } = fakeFetch({
      'https://bp.example/limited.mp3': 429,
      'https://bp.example/after-limit.mp3': 200,
    })
    const storePauses = createPauses()
    const result = await run({ client: fakeClient(), fetch, getRelease: fakeBandcamp({}).getRelease, storePauses })

    assert.deepStrictEqual(requests, ['https://bp.example/limited.mp3'])
    assert.deepStrictEqual(result.result.rateLimited, ['Beatport'])
    assert.strictEqual(await audioRow(limited.id), undefined, 'a rate limit is not a failed attempt')
    assert.strictEqual(storePauses.isPaused('Beatport', Date.now()), true)
    assert.strictEqual(storePauses.isPaused('Beatport', Date.now() + 11 * 60 * 1000), false)

    const next = fakeFetch({ 'https://bp.example/limited.mp3': 200 })
    await run({ client: fakeClient(), fetch: next.fetch, getRelease: fakeBandcamp({}).getRelease, storePauses })
    assert.deepStrictEqual(next.requests, [], 'a paused store is left alone by the next run')
  },

  'Bandcamp is left alone while the backend is rate limited by it': async () => {
    await clearPreviews()
    await insertPreview({ store: 'Bandcamp', releaseUrl: 'https://artist.bandcamp.com/album/paused' })
    const bandcamp = fakeBandcamp({})
    const result = await run({
      client: fakeClient(),
      fetch: fakeFetch({}).fetch,
      getRelease: bandcamp.getRelease,
      isBandcampRateLimited: () => true,
    })
    assert.deepStrictEqual(bandcamp.lookups, [])
    assert.deepStrictEqual(result.result.rateLimited, ['Bandcamp'])
  },

  'an expired Bandcamp stream is looked up once more': async () => {
    await clearPreviews()
    const releaseUrl = 'https://artist.bandcamp.com/album/expiring'
    const preview = await insertPreview({ store: 'Bandcamp', releaseUrl })
    let lookups = 0
    const bandcamp = fakeBandcamp({
      [releaseUrl]: () => release({ [preview.storeTrackId]: `https://bcbits.example/stream-${++lookups}` }),
    })
    const { fetch } = fakeFetch({ 'https://bcbits.example/stream-1': 403, 'https://bcbits.example/stream-2': 200 })
    const result = await run({ client: fakeClient(), fetch, getRelease: bandcamp.getRelease })
    assert.strictEqual(bandcamp.lookups.length, 2)
    assert.strictEqual(result.result.stored, 1)
    assert.ok((await audioRow(preview.id)).key)
  },

  'a Bandcamp track with a known stream URL is downloaded without a lookup': async () => {
    await clearPreviews()
    const releaseUrl = 'https://artist.bandcamp.com/album/just-added'
    const preview = await insertPreview({ store: 'Bandcamp', releaseUrl })
    const bandcamp = fakeBandcamp({})
    const { fetch, requests } = fakeFetch({ 'https://bcbits.example/kept': 200 })
    const result = await run({
      client: fakeClient(),
      fetch,
      getRelease: bandcamp.getRelease,
      getKnownStreamUrl: async ({ store_track_id }) =>
        store_track_id === preview.storeTrackId ? 'https://bcbits.example/kept' : null,
    })
    assert.deepStrictEqual(bandcamp.lookups, [])
    assert.deepStrictEqual(requests, ['https://bcbits.example/kept'])
    assert.strictEqual(result.result.stored, 1)
  },

  'a refused known stream URL is replaced by looking the release up': async () => {
    await clearPreviews()
    const releaseUrl = 'https://artist.bandcamp.com/album/kept-expired'
    const preview = await insertPreview({ store: 'Bandcamp', releaseUrl })
    const bandcamp = fakeBandcamp({ [releaseUrl]: release({ [preview.storeTrackId]: 'https://bcbits.example/fresh' }) })
    const { fetch } = fakeFetch({ 'https://bcbits.example/expired': 410, 'https://bcbits.example/fresh': 200 })
    const result = await run({
      client: fakeClient(),
      fetch,
      getRelease: bandcamp.getRelease,
      getKnownStreamUrl: async () => 'https://bcbits.example/expired',
    })
    assert.strictEqual(bandcamp.lookups.length, 1)
    assert.strictEqual(result.result.stored, 1)
  },

  'a stream refused after a fresh lookup pauses Bandcamp for everyone': async () => {
    await clearPreviews()
    const releaseUrl = 'https://artist.bandcamp.com/album/refused'
    const preview = await insertPreview({ store: 'Bandcamp', releaseUrl })
    const bandcamp = fakeBandcamp({
      [releaseUrl]: release({ [preview.storeTrackId]: 'https://bcbits.example/refused' }),
    })
    const suspended = []
    const result = await run({
      client: fakeClient(),
      fetch: fakeFetch({ 'https://bcbits.example/refused': 403 }).fetch,
      getRelease: bandcamp.getRelease,
      suspendBandcamp: (url, reason) => suspended.push(url),
    })
    assert.deepStrictEqual(suspended, ['https://bcbits.example/refused'])
    assert.deepStrictEqual(result.result.rateLimited, ['Bandcamp'])
    assert.strictEqual(await audioRow(preview.id), undefined, 'a rate limit is not a failed attempt')
  },

  'a Beatport page instead of audio is a failed download': async () => {
    await clearPreviews()
    const preview = await insertPreview({ store: 'Beatport', url: 'https://bp.example/page.mp3' })
    const fetch = async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })
    const client = fakeClient()
    await run({ client, fetch, getRelease: fakeBandcamp({}).getRelease })
    assert.strictEqual((await audioRow(preview.id)).attempts, 1)
    assert.deepStrictEqual(client.objects, {})
  },

  'the third failed download marks the preview missing': async () => {
    await clearPreviews()
    const preview = await insertPreview({ store: 'Beatport', url: 'https://bp.example/broken.mp3' })
    await pg.queryAsync(
      sql`INSERT INTO store__track_preview_audio
            (store__track_preview_id, store__track_preview_audio_failed_attempts, store__track_preview_audio_last_attempt_at)
          VALUES (${preview.id}, 2, NOW() - INTERVAL '2 hours')`,
    )
    const { fetch } = fakeFetch({ 'https://bp.example/broken.mp3': 500 })
    await run({ client: fakeClient(), fetch, getRelease: fakeBandcamp({}).getRelease })
    assert.strictEqual(await isMissing(preview.id), true)
  },

  'nothing is downloaded once the stored audio is at its cap': async () => {
    await clearPreviews()
    const stored = await insertPreview({ store: 'Beatport', url: 'https://bp.example/already.mp3' })
    await pg.queryAsync(
      sql`INSERT INTO store__track_preview_audio (store__track_preview_id, store__track_preview_audio_object_key)
          VALUES (${stored.id}, 'preview-audio/already.mp3')`,
    )
    await insertPreview({ store: 'Beatport', url: 'https://bp.example/waiting.mp3' })
    const { fetch, requests } = fakeFetch({ 'https://bp.example/waiting.mp3': 200 })
    const result = await run({ client: fakeClient(), fetch, getRelease: fakeBandcamp({}).getRelease, maxStored: 1 })
    assert.deepStrictEqual(requests, [])
    assert.strictEqual(result.result.capReached, true)
  },
})
