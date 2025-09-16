const [Map, MapView, Graphic] = await $arcgis.import([
  "@arcgis/core/Map.js",
  "@arcgis/core/views/MapView.js",
  "@arcgis/core/Graphic.js",
]);

// Missoula coordinates
const MISSOULA = { latitude: 46.87585, longitude: -114.01232 };

const map = new Map({
  basemap: "topo-vector",
});

const view = new MapView({
  container: "viewDiv",
  map: map,
  zoom: 12,
  center: [MISSOULA.longitude, MISSOULA.latitude], // [lon, lat]
});

// Missoula marker
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
  attributes: {
    name: "Missoula, Montana",
    population: "78,000+",
    established: "1866",
    funFact: "Home to the University of Montana.",
  },
  popupTemplate: {
    title: "{name}",
    content:
      "Population: {population}<br/>Established: {established}<br/>{funFact}",
  },
});

view.graphics.add(missoulaMarker);


