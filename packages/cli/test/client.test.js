'use strict'

const { expect } = require('chai')
const { test } = require('cascade-test')
const { FomoPlayerClient } = require('../src/client')

// Minimal fetch mock factory
const makeFetchMock = (status, body = '') => {
  const calls = []
  const mockFetch = async (url, options) => {
    calls.push({ url, options })
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
      json: async () => JSON.parse(body),
    }
  }
  mockFetch.calls = calls
  return mockFetch
}

test({
  'sends GET with auth header': {
    setup: async () => {
      const mockFetch = makeFetchMock(200, '{}')
      const originalFetch = globalThis.fetch
      globalThis.fetch = mockFetch
      const client = new FomoPlayerClient({ apiUrl: 'http://localhost:3000/api', apiKey: 'fp_test-key' })
      await client.get('/me/tracks')
      return { calls: mockFetch.calls, originalFetch }
    },
    teardown: async ({ originalFetch }) => {
      globalThis.fetch = originalFetch
    },
    'sends Authorization: Bearer header': async ({ calls }) => {
      expect(calls).to.have.length(1)
      expect(calls[0].options.headers['Authorization']).to.equal('Bearer fp_test-key')
    },
    'sends GET to the correct URL': async ({ calls }) => {
      expect(calls[0].url).to.equal('http://localhost:3000/api/me/tracks')
      expect(calls[0].options.method).to.equal('GET')
    },
  },

  'throws on non-2xx': {
    setup: async () => {
      const mockFetch = makeFetchMock(401, '{"error":"Unauthorized"}')
      const originalFetch = globalThis.fetch
      globalThis.fetch = mockFetch
      const client = new FomoPlayerClient({ apiUrl: 'http://localhost:3000/api', apiKey: 'fp_bad-key' })
      let thrownError = null
      try {
        await client.get('/me/tracks')
      } catch (err) {
        thrownError = err
      }
      return { thrownError, originalFetch }
    },
    teardown: async ({ originalFetch }) => {
      globalThis.fetch = originalFetch
    },
    'throws an error': async ({ thrownError }) => {
      expect(thrownError).to.be.instanceOf(Error)
    },
    'error message includes the status code': async ({ thrownError }) => {
      expect(thrownError.message).to.include('401')
    },
  },

  'search tracks uses the track search': {
    setup: async () => {
      const mockFetch = makeFetchMock(200, JSON.stringify({ tracks: [{ id: 1 }], page: {}, meta: {} }))
      const originalFetch = globalThis.fetch
      globalThis.fetch = mockFetch
      const client = new FomoPlayerClient({ apiUrl: 'http://localhost:3000/api', apiKey: 'fp_test-key' })
      const rows = await client.search('tracks', 'noisia')
      return { rows, calls: mockFetch.calls, originalFetch }
    },
    teardown: async ({ originalFetch }) => {
      globalThis.fetch = originalFetch
    },
    'calls /tracks with the query': async ({ calls }) => {
      expect(calls[0].url).to.equal('http://localhost:3000/api/tracks?q=noisia')
    },
    'returns the matching tracks': async ({ rows }) => {
      expect(rows).to.deep.equal([{ id: 1 }])
    },
  },

  'getCartTracks reads every page without a limit': {
    setup: async () => {
      const all = Array.from({ length: 503 }, (_, i) => ({ id: i }))
      const calls = []
      const originalFetch = globalThis.fetch
      globalThis.fetch = async (url) => {
        calls.push(url)
        const { searchParams } = new URL(url)
        const offset = Number(searchParams.get('offset'))
        const limit = Number(searchParams.get('limit'))
        const body = { track_count: all.length, tracks: all.slice(offset, offset + limit) }
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
      }
      const client = new FomoPlayerClient({ apiUrl: 'http://localhost:3000/api', apiKey: 'fp_test-key' })
      const tracks = await client.getCartTracks(7)
      const page = await client.getCartTracks(7, { offset: 10, limit: 5 })
      return { tracks, page, calls, originalFetch }
    },
    teardown: async ({ originalFetch }) => {
      globalThis.fetch = originalFetch
    },
    'returns all tracks': async ({ tracks }) => {
      expect(tracks).to.have.length(503)
    },
    'returns one page when a limit is given': async ({ page, calls }) => {
      expect(page.map(({ id }) => id)).to.deep.equal([10, 11, 12, 13, 14])
      expect(calls[2]).to.equal('http://localhost:3000/api/me/carts/7?offset=10&limit=5')
    },
  },
})
