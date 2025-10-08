// Import required modules
const [Map, MapView, FeatureLayer, Query, ClassBreaksRenderer, SimpleLineSymbol] = await $arcgis.import([
  "@arcgis/core/Map.js",
  "@arcgis/core/views/MapView.js",
  "@arcgis/core/layers/FeatureLayer.js",
  "@arcgis/core/rest/support/Query.js",
  "@arcgis/core/renderers/ClassBreaksRenderer.js",
  "@arcgis/core/symbols/SimpleLineSymbol.js"
]);

// Prompt user for year
const userYear = prompt("Enter a year to view hurricanes (e.g., 2020):", "2020");

// Validate input
if (!userYear || isNaN(userYear)) {
  alert("Please enter a valid year.");
  throw new Error("Invalid year input");
}

// Create the map
const map = new Map({
  basemap: "dark-gray-vector"
});

// Create the view
const view = new MapView({
  container: "viewDiv",
  map: map,
  center: [-65, 25], 
  zoom: 3
});

// Create renderer with dotted lines and ColorBrewer YlOrRd colors
// Categorized by wind speed using Saffir-Simpson scale
const hurricaneRenderer = new ClassBreaksRenderer({
  field: "USA_WIND",
  defaultSymbol: new SimpleLineSymbol({
    color: [200, 200, 200, 0.8],
    width: 2,
    style: "dot"
  }),
  classBreakInfos: [
    {
      minValue: 0,
      maxValue: 63,
      symbol: new SimpleLineSymbol({
        color: [255, 255, 178, 0.9], // Light yellow
        width: 1.5,
        style: "dot"
      }),
      label: "Tropical Storm (< 64 knots)"
    },
    {
      minValue: 64,
      maxValue: 82,
      symbol: new SimpleLineSymbol({
        color: [254, 217, 118, 0.9], // Yellow-orange
        width: 2.5,
        style: "dot"
      }),
      label: "Category 1 (64-82 knots)"
    },
    {
      minValue: 83,
      maxValue: 95,
      symbol: new SimpleLineSymbol({
        color: [254, 178, 76, 0.9], // Orange
        width: 3.5,
        style: "dot"
      }),
      label: "Category 2 (83-95 knots)"
    },
    {
      minValue: 96,
      maxValue: 112,
      symbol: new SimpleLineSymbol({
        color: [253, 141, 60, 0.9], // Dark orange
        width: 4.5,
        style: "dot"
      }),
      label: "Category 3 (96-112 knots)"
    },
    {
      minValue: 113,
      maxValue: 136,
      symbol: new SimpleLineSymbol({
        color: [240, 59, 32, 0.9], // Red-orange
        width: 5.5,
        style: "dot"
      }),
      label: "Category 4 (113-136 knots)"
    },
    {
      minValue: 137,
      maxValue: 300,
      symbol: new SimpleLineSymbol({
        color: [189, 0, 38, 0.9], // Dark red
        width: 7,
        style: "dot"
      }),
      label: "Category 5 (> 136 knots)"
    }
  ]
});

// Configure popup template
const popupTemplate = {
  title: "{NAME}",
  content: [
    {
      type: "fields",
      fieldInfos: [
        {
          fieldName: "year",
          label: "Year"
        },
        {
          fieldName: "USA_WIND",
          label: "Maximum Wind Speed (knots)"
        },
        {
          fieldName: "BASIN",
          label: "Basin"
        },
        {
          fieldName: "NATURE",
          label: "Nature"
        },
        {
          fieldName: "Hurricane_Date",
          label: "Date"
        }
      ]
    }
  ]
};

// Create hurricane layer
const hurricaneLayer = new FeatureLayer({
  url: "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/IBTrACS_ALL_list_v04r00_lines_1/FeatureServer/0",
  renderer: hurricaneRenderer,
  popupTemplate: popupTemplate,
  definitionExpression: `year = ${userYear}`
});

// Add layer to map
map.add(hurricaneLayer);

// Create query for the selected year
const yearQuery = new Query({
  where: `year = ${userYear}`,
  returnGeometry: true,
  outFields: ["*"]
});

// Execute query to check for results
hurricaneLayer.when(function() {
  hurricaneLayer.queryFeatures(yearQuery).then(function(result) {
    if (result.features.length === 0) {
      alert(`No hurricane data found for year ${userYear}. Try another year.`);
    }
  }, function(error) {
    alert("Error querying hurricanes. Please check the year and try again.");
  });
});

