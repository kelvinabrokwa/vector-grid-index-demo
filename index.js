// global spatial index
var loadedFeatures = {};
var tree = rbush();

var map;

createMap();

function createMap() {

  map = L.map('map', {});

  map.setView({lat: 43.6260475, lng: -70.295306}, 14);

  L.tileLayer('http://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  var url = 'http://tiles.vetro.io:4001/tiles/{z}/{x}/{y}.pbf';

  var vectorTileOptions = {
    rendererFactory: L.canvas.tile,
    interactive: true,
    view_businesses: [],
    view_point_premise: [],
    view_statewide_business: []
  };

  var pbfLayer = L.vectorGrid.protobuf(url, vectorTileOptions)
    .on('click', function(e) {
      var buffer = .001;
      var features = tree.search({
        minX: e.latlng.lng - buffer,
        minY: e.latlng.lat - buffer,
        maxX: e.latlng.lng + buffer,
        maxY: e.latlng.lat + buffer
      });
      console.log(features);
    })
    .addTo(map);

}

