const [Map, MapView, Graphic] = await $arcgis.import([
  "@arcgis/core/Map.js",
  "@arcgis/core/views/MapView.js",
  "@arcgis/core/Graphic.js",
]);

//#region Constants
const MISSOULA = { latitude: 46.87585, longitude: -114.01232 };
//#endregion

//#region Map & View
const map = new Map({ basemap: "topo-vector" });

const view = new MapView({
  container: "viewDiv",
  map,
  zoom: 12,
  center: [MISSOULA.longitude, MISSOULA.latitude],
});

view.when(() => console.log("MapView is ready!"));
//#endregion

//#region Helper
function makeMarker({ lon, lat, color = "red" }) {
  return new Graphic({
    geometry: { type: "point", longitude: lon, latitude: lat },
    symbol: { type: "simple-marker", color, outline: { color: "white", width: 1 } },
    attributes: {
      name: "Missoula, Montana",
      population: "78,000+",
      established: "1866",
      funFact: "Home to the University of Montana.",
    },
    popupTemplate: {
      title: "{name}",
      content: "Population: {population}<br/>Established: {established}<br/>{funFact}",
    },
  });
}
//#endregion

//#region Graphics
const missoulaMarker = makeMarker({
  lon: MISSOULA.longitude,
  lat: MISSOULA.latitude,
  color: "red",
});

view.graphics.add(missoulaMarker);
//#endregion

//#region ESLint demo




const a = "5";
if (a === 5) {
  console.log("loose equality");
}

debugger;
//#endregion
