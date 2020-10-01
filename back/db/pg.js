"use strict"

const env = require('../env.js')
console.log('Initiating server with env: ', env)
module.exports = require('pg-using-bluebird')(env)
