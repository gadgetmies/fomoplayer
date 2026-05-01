'use strict'

// conf@10 is the last CJS-compatible version of the conf package
const Conf = require('conf')

const conf = new Conf({ projectName: 'fomoplayer' })

const getApiKey = () => conf.get('apiKey') || null

const setApiKey = (key) => conf.set('apiKey', key)

const clearApiKey = () => conf.delete('apiKey')

// Reads FOMOPLAYER_API_URL env or falls back to the production API URL
const getApiUrl = () => process.env.FOMOPLAYER_API_URL || 'https://fomoplayer.com'

module.exports = { getApiKey, setApiKey, clearApiKey, getApiUrl }
