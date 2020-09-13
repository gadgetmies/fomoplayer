"use strict"

const env = require('../env.js')
module.exports = require('pg-using-bluebird')(env)
