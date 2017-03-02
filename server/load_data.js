#!/usr/bin/env node
var fs = require('fs');
var parse = require('csv-parse');
var pg = require('pg');

var pgPool = new pg.Pool({
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  ssl: true
});

var parser = parse({delimiter: ','});

parser.on('readable', function() {
  while (record = parser.read()) {
    var lon = record[0];
    var lat = record[1];
    var address = `${record[2]} ${record[3]}`;
    pgPool.connect(function(err, client, done) {
      if (err)
        return console.log(err);
      var query = `INSERT INTO addresses (geom, address) ` +
                  `VALUES (ST_Point(${lon}, ${lat}), '${address}')`;
      client.query(query, function(err, result) {
        done();
        if (err)
          return console.log(err);
      });
    });
  }
});

parser.on('error', function(err) {
  console.log(err);
});

parser.on('finish', function() {
  console.log('done');
});

var lineReader = require('readline').createInterface({
  input: require('fs').createReadStream('data/city_of_alexandria.csv')
});

lineReader.on('line', function(line) {
  parser.write(line + '\n');
});

lineReader.on('close', function() {
  parser.end();
});

