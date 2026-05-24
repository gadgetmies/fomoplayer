'use strict';
var fs = require('fs');
var path = require('path');

function runSqlFile(db, name) {
  var filePath = path.join(__dirname, 'sqls', name);
  return new Promise(function (resolve, reject) {
    fs.readFile(filePath, { encoding: 'utf-8' }, function (err, data) {
      if (err) return reject(err);
      resolve(data);
    });
  }).then(function (data) {
    return db.runSql(data);
  });
}

exports.up = function (db) {
  return runSqlFile(db, '20260523140000-update-beatport-genre-playlist-urls-up.sql');
};

exports.down = function (db) {
  return runSqlFile(db, '20260523140000-update-beatport-genre-playlist-urls-down.sql');
};
