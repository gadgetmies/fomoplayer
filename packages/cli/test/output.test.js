'use strict'

const { expect } = require('chai')
const { test } = require('cascade-test')
const { filterFields } = require('../src/output')

const sampleRows = [
  { track_isrc: 'USRC12345678', track_title: 'Song A', artist_name: 'Artist X' },
  { track_isrc: 'GBUM71234567', track_title: 'Song B', artist_name: 'Artist Y' },
]

test({
  'filterFields returns all fields when none specified': {
    setup: async () => {
      const resultUndefined = filterFields(sampleRows, undefined)
      const resultEmpty = filterFields(sampleRows, [])
      return { resultUndefined, resultEmpty }
    },
    'returns all rows unchanged when fields is undefined': async ({ resultUndefined }) => {
      expect(resultUndefined).to.deep.equal(sampleRows)
    },
    'returns all rows unchanged when fields is empty array': async ({ resultEmpty }) => {
      expect(resultEmpty).to.deep.equal(sampleRows)
    },
  },

  'filterFields filters to specified fields': {
    setup: async () => {
      const result = filterFields(sampleRows, ['track_isrc'])
      return { result }
    },
    'only returns specified key in each row': async ({ result }) => {
      expect(result).to.have.length(2)
      expect(result[0]).to.deep.equal({ track_isrc: 'USRC12345678' })
      expect(result[1]).to.deep.equal({ track_isrc: 'GBUM71234567' })
    },
    'omits non-specified keys': async ({ result }) => {
      expect(result[0]).to.not.have.property('track_title')
      expect(result[0]).to.not.have.property('artist_name')
    },
  },

  'filterFields is case-insensitive': {
    setup: async () => {
      const result = filterFields(sampleRows, ['TRACK_ISRC'])
      return { result }
    },
    'matches lowercase key when field name is uppercased': async ({ result }) => {
      expect(result).to.have.length(2)
      expect(result[0]).to.deep.equal({ track_isrc: 'USRC12345678' })
      expect(result[1]).to.deep.equal({ track_isrc: 'GBUM71234567' })
    },
  },
})
