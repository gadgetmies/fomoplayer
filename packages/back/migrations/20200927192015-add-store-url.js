'use strict'

var dbm
var type
var seed
var fs = require('fs')
var path = require('path')
var Promise

/**
 * We receive the dbmigrate dependency from dbmigrate initially.
 * This enables us to not have to rely on NODE_PATH.
 */
exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate
  type = dbm.dataType
  seed = seedLink
  Promise = options.Promise
}

exports.up = function (db) {
  var filePath = path.join(__dirname, 'sqls', '20200927192015-add-store-url-up.sql')
  return new Promise(function (resolve, reject) {
    fs.readFile(filePath, { encoding: 'utf-8' }, function (err, data) {
      if (err) return reject(err)
      if (db.log.isSilent !== true) {
        console.log('received data: ' + data)
      }

      resolve(data)
    })
  }).then(function (data) {
    return db.runSql(data)
  })
}

exports.down = function (db) {
  var filePath = path.join(__dirname, 'sqls', '20200927192015-add-store-url-down.sql')
  return new Promise(function (resolve, reject) {
    fs.readFile(filePath, { encoding: 'utf-8' }, function (err, data) {
      if (err) return reject(err)
      if (db.log.isSilent !== true) {
        console.log('received data: ' + data)
      }

      resolve(data)
    })
  }).then(function (data) {
    return db.runSql(data)
  })
}

exports._meta = {
  version: 1,
}
