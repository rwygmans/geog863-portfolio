// ArcGIS Maps SDK
const [Map, MapView, MapImageLayer] = await window.$arcgis.import([
  "@arcgis/core/Map.js",
  "@arcgis/core/views/MapView.js",
  "@arcgis/core/layers/MapImageLayer.js",
]);

const SERVICE_URL = "https://sampleserver6.arcgisonline.com/arcgis/rest/services/USA/MapServer";

// Map service (Counties sublayer only)
const usaLayer = new MapImageLayer({
  url: SERVICE_URL,
  sublayers: [
    { id: 3, title: "Counties", visible: true }
  ],
});

const map = new Map({
  basemap: "gray-vector",
  layers: [usaLayer]
});

const view = new MapView({
  container: "viewDiv",
  map: map,
  center: [-98, 38],
  zoom: 4
});


