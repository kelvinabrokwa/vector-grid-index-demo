// global spatial index
var loadedFeatures = {};
var tree = rbush();
var debugBoxes = [];

var map;
var buffer = .001;
var infoDiv = document.getElementById('info');

createMap();

function createMap() {
  map = L.map('map', {});

  map.setView({lat: 38.8027947337829, lng: -77.06497192382812}, 13);

  L.tileLayer('http://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  var url = 'http://ec2-52-87-190-19.compute-1.amazonaws.com/tiles/{z}/{x}/{y}.pbf';

  var vectorTileOptions = {
    rendererFactory: L.canvas.tile,
    interactive: true,
    vectorTileLayerStyles: {
      //parks: [],
      //biketrails: [],
      addresses: {
        radius: 2
      }
    },
    getFeatureId(feat) {
      return feat.id;
    }
  };

  var pbfLayer = L.vectorGrid.protobuf(url, vectorTileOptions)
    .on('click', function(e) {
      var features = tree.search({
        minX: e.latlng.lng - buffer,
        minY: e.latlng.lat - buffer,
        maxX: e.latlng.lng + buffer,
        maxY: e.latlng.lat + buffer
      });
      console.log(features);
    })
    .on('click', function(e) {
      console.log(e);
    })
    .addTo(map);

  map.on('mousemove', function(e) {
    var features = tree.search({
      minX: e.latlng.lng - buffer,
      minY: e.latlng.lat - buffer,
      maxX: e.latlng.lng + buffer,
      maxY: e.latlng.lat + buffer
    });
    infoDiv.innerHTML = features.map(f => '<div>' + f.layerName + ' ' + f.id + '</div>').join('');
  });
}

function debug() {
  var geojLayer = L.vectorGrid.slicer(turf.featureCollection(debugBoxes), {
    rendererFactory: L.canvas.tile,
    vectorTileLayerStyles: {
      sliced: {
        color: 'red'
      }
    }
  })
    .addTo(map);
  console.log('debug on');
}
