'use strict';
var fs = require('fs');
var path = require('path');

function readSql(name) {
  var filePath = path.join(__dirname, 'sqls', name);
  return new Promise(function (resolve, reject) {
    fs.readFile(filePath, { encoding: 'utf-8' }, function (err, data) {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

exports.up = function (db) {
  return readSql('20260524100000-add-bandcamp-label-artist-refetch-up.sql').then(function (data) {
    return db.runSql(data);
  });
};

exports.down = function (db) {
  return readSql('20260524100000-add-bandcamp-label-artist-refetch-down.sql').then(function (data) {
    return db.runSql(data);
  });
};
