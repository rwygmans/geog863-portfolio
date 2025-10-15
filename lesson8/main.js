// Import required modules
const [Map, MapView, FeatureLayer, Query, ClassBreaksRenderer, SimpleLineSymbol] = await $arcgis.import([
  "@arcgis/core/Map.js",
  "@arcgis/core/views/MapView.js",
  "@arcgis/core/layers/FeatureLayer.js",
  "@arcgis/core/rest/support/Query.js",
  "@arcgis/core/renderers/ClassBreaksRenderer.js",
  "@arcgis/core/symbols/SimpleLineSymbol.js"
]);

// Initialize dates and button
setDates();
document.getElementById("getHurricanesButton").addEventListener("click", loadHurricanes);

// Create the map
const map = new Map({
  basemap: "dark-gray-vector"
});

// Create the view
const view = new MapView({
  container: "viewDiv",
  map: map,
  center: [0, 20], 
  zoom: 2
});

// Wire up components when view is ready
view.when(() => {
  // Wire home button
  const homeEl = document.querySelector("arcgis-home");
  if (homeEl) {
    homeEl.view = view;
  }
  
  // Wire basemap toggle
  const basemapToggleEl = document.querySelector("arcgis-basemap-toggle");
  if (basemapToggleEl) {
    basemapToggleEl.view = view;
    basemapToggleEl.nextBasemap = "satellite";
  }
});

// Create renderer with dotted lines and ColorBrewer YlOrRd colors
// Categorized by wind speed using Saffir-Simpson scale
const hurricaneRenderer = new ClassBreaksRenderer({
  field: "USA_WIND",
  legendOptions: { title: " " },
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
      maxValue: 1000,
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
  definitionExpression: "1=0"
});

// Add layer to map
map.add(hurricaneLayer);

// Wire legend
hurricaneLayer.when(() => {
  const legendEl = document.querySelector("arcgis-legend");
  if (legendEl) {
    legendEl.view = view;
    legendEl.layerInfos = [{ layer: hurricaneLayer, title: "Hurricane Intensity" }];
  }
});

// Set default date range
function setDates() {
  const dtFrom = document.getElementById("dateFrom");
  const dtTo = document.getElementById("dateTo");
  
  // Set date picker constraints and default values
  if (dtFrom) {
    Object.assign(dtFrom, {
      min: "1842-01-01",
      max: "2024-12-31",
      value: "2020-01-01"
    });
  }
  if (dtTo) {
    Object.assign(dtTo, {
      min: "1842-01-01",
      max: "2024-12-31",
      value: "2020-12-31"
    });
  }
}

// Get date strings and swap if needed
function getDateStrings() {
  const dtFrom = document.getElementById("dateFrom");
  const dtTo = document.getElementById("dateTo");
  let startDate = (dtFrom && dtFrom.value) ? String(dtFrom.value) : "2020-01-01";
  let endDate = (dtTo && dtTo.value) ? String(dtTo.value) : "2020-12-31";
  if (startDate > endDate) {
    [startDate, endDate] = [endDate, startDate];
  }
  return { startDate, endDate };
}

// Load hurricanes based on date range
async function loadHurricanes() {
  const noticeEl = document.getElementById("notice");
  const msgEl = document.getElementById("hurricaneCount");
  const { startDate, endDate } = getDateStrings();

  const whereClause = `Hurricane_Date >= DATE '${startDate}' AND Hurricane_Date <= DATE '${endDate}'`;
  hurricaneLayer.definitionExpression = whereClause;

  try {
    const count = await hurricaneLayer.queryFeatureCount();
    if (msgEl) msgEl.textContent = `Found ${count} hurricane track(s) meeting your criteria`;
    if (noticeEl) {
      noticeEl.kind = count > 0 ? "success" : "warning";
      noticeEl.open = true;
    }
    populateResultsList(whereClause);
  } catch (error) {
    console.error("Query error:", error);
    if (noticeEl) {
      noticeEl.kind = "danger";
      noticeEl.open = true;
    }
  }
}

// Populate sidebar list
function populateResultsList(whereClause) {
  const tbody = document.querySelector('#hurricaneList tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const query = new Query({
    where: whereClause,
    outFields: ["OBJECTID", "NAME", "USA_WIND", "Hurricane_Date"],
    returnGeometry: true
  });

  hurricaneLayer.queryFeatures(query).then((result) => {
    const features = result.features || [];
    
    // Sort by name, then date
    const sorted = features.sort((a, b) => {
      const nameA = (a.attributes.NAME || '').toLowerCase();
      const nameB = (b.attributes.NAME || '').toLowerCase();
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      const dateA = a.attributes.Hurricane_Date ? new Date(a.attributes.Hurricane_Date).getTime() : 0;
      const dateB = b.attributes.Hurricane_Date ? new Date(b.attributes.Hurricane_Date).getTime() : 0;
      return dateA - dateB;
    });

    const fragment = document.createDocumentFragment();
    sorted.forEach((graphic) => {
      const { NAME, USA_WIND, Hurricane_Date } = graphic.attributes;
      const tr = document.createElement('tr');
      
      tr.innerHTML = `
        <td>${NAME || '(unnamed)'}</td>
        <td>${Hurricane_Date ? new Date(Hurricane_Date).toLocaleDateString() : ''}</td>
        <td>${USA_WIND != null ? USA_WIND : ''}</td>
      `;

      tr.addEventListener('click', () => {
        view.goTo({ target: graphic.geometry, scale: 5000000 }).then(() => {
          view.popup.open({
            features: [graphic],
            location: graphic.geometry.extent ? graphic.geometry.extent.center : graphic.geometry
          });
        });
      });

      fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
  }).catch((error) => {
    console.error("Error populating results list:", error);
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #d32f2f;">Error loading hurricane list</td></tr>';
  });
}
