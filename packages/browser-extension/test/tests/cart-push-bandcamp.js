'use strict'

const assert = require('assert')
const { test } = require('cascade-test')
const { installBrowserStub, clearBrowserStub, reloadCartPushModules } = require('../lib/cart-push-stubs')

const freshModules = () => {
  installBrowserStub()
  reloadCartPushModules()
  const state = require('../../src/js/cart-push/state')
  const bandcamp = require('../../src/js/cart-push/bandcamp')
  return { state, bandcamp }
}

const cleanup = () => {
  clearBrowserStub()
  reloadCartPushModules()
}

const cartFixture = (count) => ({
  name: 'bc-test',
  tracks: Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `T${i + 1}`,
    artists: [{ name: 'Artist' }],
    stores: [{ code: 'bandcamp', url: `https://artist.bandcamp.com/track/t${i + 1}` }],
  })),
})

const makeDeps = (cart) => ({
  apiFetch: async () => cart,
  getAppUrl: async () => 'https://fomoplayer.test',
})

test({
  'partitionIntoBatches': {
    'N=null with 12 → 1 batch of 12': () => {
      const { bandcamp } = freshModules()
      try {
        const q = Array.from({ length: 12 }, (_, i) => ({ i }))
        const batches = bandcamp.partitionIntoBatches(q, null)
        assert.strictEqual(batches.length, 1)
        assert.strictEqual(batches[0].length, 12)
      } finally {
        cleanup()
      }
    },
    'N=5 with 12 → batches of 5/5/2': () => {
      const { bandcamp } = freshModules()
      try {
        const q = Array.from({ length: 12 }, (_, i) => ({ i }))
        const batches = bandcamp.partitionIntoBatches(q, 5)
        assert.deepStrictEqual(batches.map((b) => b.length), [5, 5, 2])
      } finally {
        cleanup()
      }
    },
    'N=1 with 3 → 1/1/1': () => {
      const { bandcamp } = freshModules()
      try {
        const q = Array.from({ length: 3 }, (_, i) => ({ i }))
        const batches = bandcamp.partitionIntoBatches(q, 1)
        assert.deepStrictEqual(batches.map((b) => b.length), [1, 1, 1])
      } finally {
        cleanup()
      }
    },
  },

  'Bandcamp run flow': {
    'start opens first batch, awaiting next when more batches remain': async () => {
      const { state, bandcamp } = freshModules()
      try {
        await state.writeBandcampBatchSize(2)
        await bandcamp.startBandcampRun({ fomoplayerCartId: 1 }, makeDeps(cartFixture(4)))
        const run = await state.readRun()
        assert.strictEqual(run.batchSize, 2)
        assert.strictEqual(run.batchCount, 2)
        assert.strictEqual(run.batchIndex, 0)
        assert.strictEqual(run.status, state.RunStatus.AWAITING_NEXT_BATCH)
        assert.strictEqual(run.results.added.length, 2)
        assert.strictEqual(global.browser.tabs.created.length, 2)
      } finally {
        cleanup()
      }
    },

    'start with null batchSize → completed in one shot': async () => {
      const { state, bandcamp } = freshModules()
      try {
        await state.writeBandcampBatchSize(null)
        await bandcamp.startBandcampRun({ fomoplayerCartId: 1 }, makeDeps(cartFixture(4)))
        const run = await state.readRun()
        assert.strictEqual(run.batchCount, 1)
        assert.strictEqual(run.status, state.RunStatus.COMPLETED)
        assert.strictEqual(run.results.added.length, 4)
        assert.strictEqual(global.browser.tabs.created.length, 4)
      } finally {
        cleanup()
      }
    },

    'openNextBandcampBatch advances batchIndex and transitions to completed on the last batch': async () => {
      const { state, bandcamp } = freshModules()
      try {
        await state.writeBandcampBatchSize(2)
        await bandcamp.startBandcampRun({ fomoplayerCartId: 1 }, makeDeps(cartFixture(4)))
        let run = await state.readRun()
        assert.strictEqual(run.batchIndex, 0)
        assert.strictEqual(run.status, state.RunStatus.AWAITING_NEXT_BATCH)
        await bandcamp.openNextBandcampBatch()
        run = await state.readRun()
        assert.strictEqual(run.batchIndex, 1)
        assert.strictEqual(run.status, state.RunStatus.COMPLETED)
        assert.strictEqual(run.results.added.length, 4)
        assert.strictEqual(global.browser.tabs.created.length, 4)
      } finally {
        cleanup()
      }
    },

    'multi-step advance: batchSize 1, 3 tracks → 1/1/1 transitions through states': async () => {
      const { state, bandcamp } = freshModules()
      try {
        await state.writeBandcampBatchSize(1)
        await bandcamp.startBandcampRun({ fomoplayerCartId: 1 }, makeDeps(cartFixture(3)))
        let run = await state.readRun()
        assert.strictEqual(run.batchCount, 3)
        assert.strictEqual(run.batchIndex, 0)
        assert.strictEqual(run.status, state.RunStatus.AWAITING_NEXT_BATCH)
        await bandcamp.openNextBandcampBatch()
        run = await state.readRun()
        assert.strictEqual(run.batchIndex, 1)
        assert.strictEqual(run.status, state.RunStatus.AWAITING_NEXT_BATCH)
        await bandcamp.openNextBandcampBatch()
        run = await state.readRun()
        assert.strictEqual(run.batchIndex, 2)
        assert.strictEqual(run.status, state.RunStatus.COMPLETED)
        assert.strictEqual(run.results.added.length, 3)
      } finally {
        cleanup()
      }
    },

    'openNextBandcampBatch with no run returns ok:false': async () => {
      const { bandcamp } = freshModules()
      try {
        const r = await bandcamp.openNextBandcampBatch()
        assert.strictEqual(r.ok, false)
      } finally {
        cleanup()
      }
    },
  },
})
