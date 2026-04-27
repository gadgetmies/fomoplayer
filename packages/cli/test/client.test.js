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
      const client = new FomoPlayerClient({ apiUrl: 'http://localhost:3000', apiKey: 'fp_test-key' })
      await client.get('/api/me/tracks')
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
      const client = new FomoPlayerClient({ apiUrl: 'http://localhost:3000', apiKey: 'fp_bad-key' })
      let thrownError = null
      try {
        await client.get('/api/me/tracks')
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
})
