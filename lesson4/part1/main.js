const [Map, MapView, Graphic] = await $arcgis.import([
  "@arcgis/core/Map.js",
  "@arcgis/core/views/MapView.js",
  "@arcgis/core/Graphic.js",
]);

// Single source of truth for location
const MISSOULA = { latitude: 46.87585, longitude: -114.01232 };

const map = new Map({
  basemap: "topo-vector",
});

const view = new MapView({
  container: "viewDiv",
  map: map,
  zoom: 12,
  center: [MISSOULA.longitude, MISSOULA.latitude], // longitude, latitude
});

// Marker pointing to Missoula using the same coordinates
const missoulaMarker = new Graphic({
  geometry: {
    type: "point",
    longitude: MISSOULA.longitude,
    latitude: MISSOULA.latitude,
  },
  symbol: {
    type: "simple-marker",
    color: "red",
    outline: { color: "white", width: 1 },
  },
});

view.graphics.add(missoulaMarker);

