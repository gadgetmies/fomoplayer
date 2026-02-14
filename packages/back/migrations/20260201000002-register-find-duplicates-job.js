'use strict';
var fs = require('fs');
var path = require('path');

exports.up = function(db) {
  var filePath = path.join(__dirname, 'sqls', '20260201000002-register-find-duplicates-job-up.sql');
  return new Promise( function( resolve, reject ) {
    fs.readFile(filePath, {encoding: 'utf-8'}, function(err,data){
      if (err) return reject(err);
      resolve(data);
    });
  }).then(function(data) {
    return db.runSql(data);
  });
};

exports.down = function(db) {
  return db.runSql("DELETE FROM job_schedule WHERE job_id = (SELECT job_id FROM job WHERE job_name = 'findDuplicates'); DELETE FROM job WHERE job_name = 'findDuplicates';");
};
