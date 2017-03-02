/**
 * This program is a proof of concept vector tile server
 */
var pg = require('pg');
var path = require('path');
var cors = require('cors');
var zlib = require('zlib');
var redis = require('redis');
var mapnik = require('mapnik');
var morgan = require('morgan');
var queue = require('d3-queue');
var express = require('express');
var process = require('process');
var feature = require('turf-feature');
var bodyParser = require('body-parser');
var bboxPoly = require('@turf/bbox-polygon');
var SphericalMercator = require('sphericalmercator');
var featureCollection = require('turf-featurecollection');

var app = express();

// express middleware
app.use(cors());
app.use(morgan('dev'));
app.use(bodyParser.json());

var PORT = process.env.PORT;

// postgres connection
var pgPool = new pg.Pool({
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  ssl: true
});

// redis connection
// connects to local server by default
var redisClient = redis.createClient({ url: process.env.REDIS_URL, return_buffers: true });

// setup Mapnik
mapnik.registerDatasource(path.join(mapnik.settings.paths.input_plugins, 'geojson.input'));

// for finding tile bounding box
var mercator = new SphericalMercator({ size: 256 });

/**
 * Vector tiles endpoint
 */
app.get('/tiles/:z/:x/:y.pbf', function(req, res) {
  // set response headers
  res.setHeader('Content-Encoding', 'deflate')
  res.setHeader('Content-Type', 'application/x-protobuf')

  var x = +req.params.x,
      y = +req.params.y,
      z = +req.params.z;

  // mapnik only accepts positive x coordinates within range, this fixes that
  // for example at zoom 2, x = -1 becomes x = 3
  var n = Math.pow(2, z);
  x = ((x % n) + n) % n;

  var views = [
    //'view_businesses',
    //'view_statewide_businesses',
    //'view_point_premise'
    'addresses'
  ];

  var q = queue.queue();

  // create tiles concurrently
  for (var i = 0; i < views.length; i++) {
    q.defer(getTile, views[i], x, y, z);
  }

  q.awaitAll(function(err, layers, tileHash) {
    if (err) {
      console.log(err);
      return res.end();
    }

    var tile = new mapnik.VectorTile(z, x, y);

    for (var i = 0; i < layers.length; i++) {
      tile.addGeoJSON(JSON.stringify(layers[i].features), layers[i].view);
    }

    tile.getData(function(err, data) {
      if (err) {
        console.log(err);
        return res.end();
      }
      zlib.deflate(data, function(err, pbf) {
        if (err) {
          console.log(err);
          return res.end();
        }
        res.send(pbf)

        // cache the tile but only on cache miss
        if (tileHash)
          redisClient.set(tileHash, pbf, redis.print);
      });
    });
  });
});


/**
 *
 */
function getTile(view, x, y, z, cb) {
  var tileHash = view + [x, y, z].join('-');

  // check tile cache first
  redisClient.get(tileHash, function(err, tile) {
    if (err) {
      console.log(err);
    }

    if (tile) {
      // cache hit
      return cb(null, tile, null);
    }

    var query = "SELECT ST_AsGeoJSON(geom) as feature, gid from " + view +
                " WHERE geom && ST_GeomFromGeoJSON($1)";

    var bboxGeom = bboxPoly(mercator.bbox(x, y, z, false, '4326')).geometry;

    pgPool.connect(function(err, client, done) {
      if (err) {
        cb(err);
      }

      client.query(query, [JSON.stringify(bboxGeom)], function(err, result) {
        done(); // release pg client back into pool

        if (err) {
          cb(err);
        }

        var features = featureCollection(result.rows.map(function(r) {
          var f = feature(JSON.parse(r.feature));
          f.properties.id = r.id;
          f.properties.table = view;
          return f;
        }));
        console.log(JSON.stringify(bboxGeom, 2, null), features);

        cb(null, { view: view, features: features }, tileHash);
      });
    });
  });
}


/**
 * get the geojson for a feature
 */
app.get('/features/:table/:id', function(req, res) {
  var id = req.params.id;
  var table = req.params.table;
  var query = 'SELECT ST_AsGeoJSON(geom), gid ' +
              'FROM ' + table + ' WHERE gid=$1';
  pgPool.connect(function(err, client, done) {
    if (err) {
      console.log(err);
      res.end();
    }
    client.query(query, [id], function(err, result) {
      done();
      if (err) {
        console.log(err);
        return res.status(404).json({ error: 'cannot GET feature' });
      }
      var geometry = JSON.parse(result.rows[0].st_asgeojson);
      res.json({
        type: 'Feature',
        geometry: geometry,
        properties: {
          id: id
        }
      });
    });
  });
});


app.listen(PORT, function() {
  console.log('Server listening on port :' +  PORT);
  console.log('------------------------------');
});

