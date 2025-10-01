// ArcGIS
const [Map, SceneView, Camera, FeatureLayer, SimpleRenderer, PolygonSymbol3D, ExtrudeSymbol3DLayer, Legend, PopupTemplate] = await window.$arcgis.import([
  "@arcgis/core/Map.js",
  "@arcgis/core/views/SceneView.js",
  "@arcgis/core/Camera.js",
  "@arcgis/core/layers/FeatureLayer.js",
  "@arcgis/core/renderers/SimpleRenderer.js",
  "@arcgis/core/symbols/PolygonSymbol3D",
  "@arcgis/core/symbols/ExtrudeSymbol3DLayer",
  "@arcgis/core/widgets/Legend",
  "@arcgis/core/PopupTemplate"
]);

// Map
const map = new Map({
  basemap: "dark-gray-vector",
  ground: "world-elevation"
});

// 3D symbol
const defaultSymbol = new PolygonSymbol3D({
  symbolLayers: [
    new ExtrudeSymbol3DLayer({
      material: {
        color: [111, 111, 111, 0.5]
      }
    })
  ]
});

// Renderer
const renderer = new SimpleRenderer({
  symbol: defaultSymbol,
  label: "Counties",
  visualVariables: [
    {
      type: "color",
      field: "v011_rawvalue",
      legendOptions: {
        title: "% Adult obesity"
      },
      stops: [
        { value: 24.2, color: "#fff5f0", label: "< 24.2%" },
        { value: 42.2, color: "#67000d", label: "> 42.2%" }
      ]
    },
    {
      type: "size",
      field: "v023_rawvalue",
      legendOptions: {
        title: "% Unemployment"
      },
      minSize: 100,
      minDataValue: 4.21,
      maxSize: 200000,
      maxDataValue: 13.54
    }
  ]
});

// Popup template
const popupTemplate = new PopupTemplate({
  title: "{county}, {state}",
  content: [
    {
      type: "fields",
      fieldInfos: [
        {
          fieldName: "v011_rawvalue",
          label: "Adult Obesity Rate",
          format: {
            places: 1,
            digitSeparator: true
          }
        },
        {
          fieldName: "v023_rawvalue", 
          label: "Unemployment Rate",
          format: {
            places: 1,
            digitSeparator: true
          }
        },
        {
          fieldName: "v001_rawvalue",
          label: "Premature Death Rate",
          format: {
            places: 0,
            digitSeparator: true
          }
        },
        {
          fieldName: "v009_rawvalue",
          label: "Physical Inactivity Rate",
          format: {
            places: 1,
            digitSeparator: true
          }
        }
      ]
    }
  ]
});

// County layer
const countyLayer = new FeatureLayer({
  url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/2022_County_Health_Rankings/FeatureServer/2",
  renderer: renderer,
  outFields: ["*"],
  definitionExpression: "state = 'FL'",
  title: "County Health Rankings (2022)",
  popupTemplate: popupTemplate
});

map.add(countyLayer);

// SceneView
const view = new SceneView({
  container: "viewDiv",
  map: map,
  camera: new Camera({
    position: [-86.3414, 20.45777, 1000000],
    heading: 20,
    tilt: 40
  })
});

await view.when();

// Configure popup to dock in upper right corner
view.popup.dockEnabled = true;
view.popup.dockOptions = {
  buttonEnabled: false,
  breakpoint: false,
  position: "top-right"
};

const legend = new Legend({
  view: view,
  layerInfos: [
    {
      layer: countyLayer,
      title: "County Health Rankings (2022)"
    }
  ]
});

view.ui.add(legend, "bottom-left");
