#!/usr/bin/env node
const originalConsoleLog = console.log
console.log = () => {}
const shared = require('./index.js')(process.env.NODE_ENV)
console.log = originalConsoleLog

console.log(shared.config.FRONTEND_PORT)
