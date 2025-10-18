// 2D MapView with OSM paths/tracks via Overpass
const [Map, MapView, GeoJSONLayer, FeatureLayer, Basemap, Home, esriRequest, webMercatorUtils] = await $arcgis.import([
  "@arcgis/core/Map.js",
  "@arcgis/core/views/MapView.js",
  "@arcgis/core/layers/GeoJSONLayer.js",
  "@arcgis/core/layers/FeatureLayer.js",
  "@arcgis/core/Basemap.js",
  "@arcgis/core/widgets/Home.js",
  "@arcgis/core/request.js",
  "@arcgis/core/geometry/support/webMercatorUtils.js"
]);

// Basemaps
const INITIAL_BASEMAP_ID = "358ec1e175ea41c3bf5c68f0da11ae2b"; // Dark Gray Canvas (no labels)
const COUNTY_BASEMAP_ID = "7e2b9be8a9c94e45b7f87857d8d168d6"; // County-level basemap with labels
let initialBaseLayers = [];
let initialReferenceLayers = [];
let countyBaseLayers = [];
let countyReferenceLayers = [];

// Map using initial basemap (no labels)
const map2D = new Map({
  basemap: new Basemap({ portalItem: { id: INITIAL_BASEMAP_ID } })
});

// Create both views with shared container
const container = "viewDiv";

let mapView = new MapView({
  container: container,
  map: map2D,
  center: [-98.5795, 39.8283], // Center of USA
  zoom: 4 // USA-wide view
});

// App configuration for view management (2D only)
const appConfig = {
  activeView: mapView,
  mapView: mapView,
  container: container
};

// States fill and outline (separate layers for fill control)
const statesFillLayer = new FeatureLayer({
  portalItem: {
    id: "8c2d6d7df8fa4142b0a1211c8dd66903"
  },
  title: "US States (Fill)",
  outFields: ["*"], // Get all fields to see what's available
  blendMode: "screen",
  popupEnabled: false,
  popupTemplate: {
    title: "{STATE_NAME}",
    content: [
      {
        type: "fields",
        fieldInfos: [
          {
            fieldName: "STATE_NAME",
            label: "State"
          }
        ]
      },
      {
        type: "text",
        text: "Click to zoom to this state and view trails"
      }
    ]
  },
  renderer: {
    type: "simple",
    symbol: {
      type: "simple-fill",
      color: [255, 255, 255, 0.2], // semi-transparent fill
      outline: { type: "simple-line", color: [0,0,0,0], width: 0 }
    }
  }
});

const statesOutlineLayer = new FeatureLayer({
  portalItem: { id: "8c2d6d7df8fa4142b0a1211c8dd66903" },
  title: "US States (Outline)",
  outFields: ["*"],
  popupEnabled: false,
  popupTemplate: null, // no popups on outline
  renderer: {
    type: "simple",
    symbol: {
      type: "simple-fill",
      color: [0, 0, 0, 0], // no fill
      outline: { type: "simple-line", color: [0, 204, 255, 0.9], width: 1.5 }
    }
  }
});

// Counties (initially hidden); definitionExpression set by state
const countiesLayer = new FeatureLayer({
  portalItem: {
    id: "3c164274a80748dda926a046525da610"
  },
  title: "Counties",
  outFields: ["*"],
  visible: false,
  labelsVisible: true,
  popupEnabled: false,
  popupTemplate: {
    title: "{NAME}",
    content: [
      {
        type: "fields",
        fieldInfos: [
          { fieldName: "NAME", label: "County" },
          { fieldName: "STATE_NAME", label: "State" }
        ]
      },
      { type: "text", text: "Click to zoom to county" }
    ]
  },
  renderer: {
    type: "simple",
    symbol: {
      type: "simple-fill",
      color: [255, 165, 0, 0.2], // match states fill opacity (0.2)
      outline: {
        type: "simple-line",
        color: [255, 180, 0, 0.8],
        width: 1
      }
    }
  },
  labelingInfo: [
    {
      labelPlacement: "always-horizontal",
      labelExpressionInfo: { expression: "Upper(Replace(Replace(Replace($feature.NAME, ' County', ''), ' Parish', ''), ' Borough', ''))" },
      deconflictionStrategy: "none",
      symbol: {
        type: "text",
        color: [235, 235, 235, 0.8],
        font: { family: "'Segoe UI Light', 'Roboto Light', 'Helvetica Neue', Arial", size: 8, weight: "normal", style: "normal" }
      },
      where: "NAME IS NOT NULL"
    }
  ]
});

// Add operational layers (fill below, outline above)
map2D.add(statesFillLayer);
map2D.add(countiesLayer);
map2D.add(statesOutlineLayer);

let selectedStateFips = null;
// Setup click handler (county has priority over state when visible)
function setupStateClickHandlers() { mapView.on("click", (event) => handleMapClick(event)); }

// Helpers
function getQuotedStateFips(fips) {
  const f = countiesLayer.fields.find(ff => (ff.name || '').toUpperCase() === 'STATE_FIPS');
  const isString = f ? (f.type === 'string') : true;
  return isString ? `'${fips}'` : `${fips}`;
}

function setCountyFilter(fips) {
  countiesLayer.definitionExpression = `STATE_FIPS = ${getQuotedStateFips(fips)}`;
}

function applyCountyNoFill() {
  const r = countiesLayer.renderer;
  const symbol = r && r.symbol ? r.symbol : null;
  if (symbol && symbol.type === 'simple-fill') {
    countiesLayer.renderer = { type: 'simple', symbol: { type: 'simple-fill', color: [0,0,0,0], outline: symbol.outline } };
  }
}

function toggleCountyBasemap(on) {
  try {
    initialBaseLayers.forEach((lyr) => { lyr.visible = !on; });
    countyBaseLayers.forEach((lyr) => { lyr.visible = on; });
    countyReferenceLayers.forEach((lyr) => { lyr.visible = on; });
  } catch {}
}

// Ensure OSM load after navigating to geometry
async function ensureTrailsVisibleForGeometry(geometry) {
  try {
    // Go to the geometry first
    await mapView.goTo({ target: geometry, padding: 50 });
    // Trigger OSM load immediately
    await loadOSMLayerForView();
  } catch {}
}

// Utility: wait until a layerView finishes updating (data applied)
function waitForLayerViewToFinish(layerView) {
  return new Promise((resolve) => {
    if (!layerView) return resolve();
    if (!layerView.updating) return resolve();
    const handle = layerView.watch("updating", (val) => {
      if (!val) {
        handle.remove();
        resolve();
      }
    });
  });
}

// Click handling: county first (if visible), else state
async function handleMapClick(event) {
  try {
    const response = await mapView.hitTest(event);
    // 1) County selection if layer visible
    if (countiesLayer.visible) {
      const countyHit = response.results.find(r => r.graphic && r.graphic.layer === countiesLayer);
      if (countyHit) {
        const countyName = countyHit.graphic.attributes.NAME || 'Selected County';
        await ensureTrailsVisibleForGeometry(countyHit.graphic.geometry);
        applyCountyNoFill();
        toggleCountyBasemap(true);
        // Sync county dropdown (Calcite select)
        const ddCounty = document.getElementById('ddCounty');
        if (ddCounty) {
          const name = countyHit.graphic.attributes.NAME || '';
          ddCounty.value = name;
        }
        return; // handled
      }
    }

    // 2) State selection
    const stateHit = response.results.find(r => r.graphic && (r.graphic.layer === statesFillLayer || r.graphic.layer === statesOutlineLayer));
    if (stateHit) {
      const attributes = stateHit.graphic.attributes || {};
      const stateName = attributes.STATE_NAME || attributes.NAME || attributes.STATE || attributes.STATE_NAME_1 || 'Selected State';
      const stateFips = attributes.STATE_FIPS || attributes.STATEFP || attributes.STATE_FIPS_CODE || null;
      // Zoom to the selected state
      await mapView.goTo({ target: stateHit.graphic.geometry, padding: 50 });

      // Enable and filter counties to this state by STATE_FIPS
      countiesLayer.visible = false;
      selectedStateFips = stateFips;
      if (stateFips != null) setCountyFilter(stateFips); else countiesLayer.definitionExpression = null;

      // Wait for the filtered counties to finish updating, then show
      try {
        const lv = await mapView.whenLayerView(countiesLayer);
        await waitForLayerViewToFinish(lv);
      } catch {}
      countiesLayer.visible = true;

      // Hide ALL state fills once a state is selected; keep only outlines
      statesFillLayer.definitionExpression = null;
      statesFillLayer.visible = false;

      // Do not open a popup for state selection
      // Sync state dropdown
      const ddState = document.getElementById('ddState');
      if (ddState && stateFips != null) {
        ddState.value = stateFips;
        populateCountiesDropdown(stateFips);
      }
    }
  } catch (error) {
    console.error('Error handling state click:', error);
  }
}

// Ensure view is ready
mapView.when(() => {
  console.log('MapView is ready');
  setupStateClickHandlers();
  // Add Home widget
  const homeWidget = new Home({ view: mapView });
  mapView.ui.add(homeWidget, "top-left");
  // Prepare dual-basemaps: keep both loaded, toggle via visibility
  (async () => {
    try {
      // Capture initial base and reference layers
      if (map2D.basemap) {
        if (map2D.basemap.baseLayers) {
          initialBaseLayers = map2D.basemap.baseLayers.toArray();
        }
        if (map2D.basemap.referenceLayers) {
          initialReferenceLayers = map2D.basemap.referenceLayers.toArray();
          // Ensure initial labels are OFF
          initialReferenceLayers.forEach((lyr) => { lyr.visible = false; });
        }
      }
      // Load county basemap layers and add them hidden
      const countyBm = new Basemap({ portalItem: { id: COUNTY_BASEMAP_ID } });
      if (countyBm.loadAll) { await countyBm.loadAll(); }
      // Add base layers
      countyBm.baseLayers && countyBm.baseLayers.forEach((lyr) => {
        lyr.visible = false;
        countyBaseLayers.push(lyr);
        map2D.basemap.baseLayers.add(lyr);
      });
      // Add reference layers (labels)
      countyBm.referenceLayers && countyBm.referenceLayers.forEach((lyr) => {
        lyr.visible = false; // off until county selected
        countyReferenceLayers.push(lyr);
        map2D.basemap.referenceLayers.add(lyr);
      });
    } catch (e) { /* no-op */ }
  })();

  // Populate state dropdown
  (async () => {
    try {
      await statesOutlineLayer.when();
      const query = statesOutlineLayer.createQuery();
      query.where = "1=1";
      query.outFields = ["*"]; // be flexible across schema variations
      query.returnGeometry = false;
      const res = await statesOutlineLayer.queryFeatures(query);
      const features = res.features || [];
      // Build name/fips with robust field detection and dedupe
      const opts = features.map(f => {
        const a = f.attributes || {};
        return {
          name: a.STATE_NAME || a.NAME || a.STATE || "",
          fips: a.STATE_FIPS ?? a.STATEFP ?? a.STATE_FIPS_CODE ?? null
        };
      }).filter(o => o.name);
      opts.sort((a,b) => a.name.localeCompare(b.name));
      const seen = new Set();
      const unique = opts.filter(o => { if (seen.has(o.name)) return false; seen.add(o.name); return true; });
      const ddState = document.getElementById('ddState');
      if (ddState) {
        ddState.innerHTML = '<calcite-option value="">Select a state…</calcite-option>' + unique.map(o => `<calcite-option value="${o.fips ?? ''}">${o.name}</calcite-option>`).join('');
        ddState.addEventListener('calciteSelectChange', async (e) => {
          const fips = e.target.value || null;
          if (!fips) return;
          // Find state feature
          const q2 = statesOutlineLayer.createQuery();
          const fField = statesOutlineLayer.fields.find(ff => (ff.name||'').toUpperCase()==='STATE_FIPS') ? 'STATE_FIPS' : (statesOutlineLayer.fields.find(ff => (ff.name||'').toUpperCase()==='STATEFP') ? 'STATEFP' : 'STATE_FIPS');
          q2.where = `${fField} = '${fips}'`;
          q2.outFields = ["*"]; q2.returnGeometry = true;
          const r2 = await statesOutlineLayer.queryFeatures(q2);
          const st = r2.features && r2.features[0];
          if (st) {
            // Simulate map click behavior for state
            await mapView.goTo({ target: st.geometry, padding: 50 });
            countiesLayer.visible = false;
            setCountyFilter(fips);
            const lv = await mapView.whenLayerView(countiesLayer); await waitForLayerViewToFinish(lv);
            countiesLayer.visible = true;
            statesFillLayer.visible = false;
            // Populate counties dropdown for this state
            populateCountiesDropdown(fips);
          }
        });
      }
    } catch (e) { console.error('State dropdown error', e); }
  })();
  // When Home is used to reset, show state fill again and hide counties
  mapView.watch("viewpoint", () => {
    // Heuristic: if zoomed out beyond state scale, reset layers
    if (mapView.scale > 5000000) {
      statesFillLayer.visible = true;
      statesFillLayer.definitionExpression = null; // restore all fills
      countiesLayer.visible = false;
      countiesLayer.definitionExpression = null;
      // Restore counties fill renderer to default when resetting
      countiesLayer.renderer = {
        type: 'simple',
        symbol: {
          type: 'simple-fill',
          color: [255, 165, 0, 0.2],
          outline: { type: 'simple-line', color: [255, 180, 0, 0.8], width: 1 }
        }
      };
      // Toggle basemaps back: show initial base layers, hide county base + labels
      try {
        initialBaseLayers.forEach((lyr) => { lyr.visible = true; });
        // Keep initial basemap labels OFF
        initialReferenceLayers.forEach((lyr) => { lyr.visible = false; });
        countyBaseLayers.forEach((lyr) => { lyr.visible = false; });
        countyReferenceLayers.forEach((lyr) => { lyr.visible = false; });
      } catch {}
    }
  });
});

// Populate counties dropdown filtered by state FIPS
async function populateCountiesDropdown(stateFips) {
  try {
    const ddCounty = document.getElementById('ddCounty');
    if (!ddCounty) return;
    const val = getQuotedStateFips(stateFips);
    const q = countiesLayer.createQuery();
    q.where = `STATE_FIPS = ${val}`;
    q.outFields = ["NAME", "STATE_FIPS"]; q.returnGeometry = false;
    const res = await countiesLayer.queryFeatures(q);
    const feats = res.features || [];
    const items = feats.map(f => f.attributes.NAME).filter(Boolean).sort((a,b)=>a.localeCompare(b));
    ddCounty.innerHTML = '<calcite-option value="">Select a county…</calcite-option>' + items.map(n=>`<calcite-option value="${n}">${n}</calcite-option>`).join('');
    ddCounty.selectedOption = null;
    ddCounty.addEventListener('calciteSelectChange', async (e) => {
      const name = e.target.value || '';
      if (!name) return;
      const q2 = countiesLayer.createQuery();
      q2.where = `STATE_FIPS = ${val} AND NAME = '${name.replace(/'/g,"''")}'`;
      q2.outFields=["*"]; q2.returnGeometry=true;
      const r2 = await countiesLayer.queryFeatures(q2);
      const ct = r2.features && r2.features[0];
      if (ct) {
        await ensureTrailsVisibleForGeometry(ct.geometry);
        applyCountyNoFill();
        toggleCountyBasemap(true);
      }
    });
  } catch (e) { console.error('County dropdown error', e); }
}

// Overpass API query to get OSM ways with highway=path|track within current view bbox
async function fetchOSMGeoJSON(extent) {
  // Ensure extent is geographic (WGS84) before querying Overpass
  const geoExtent = extent.spatialReference && extent.spatialReference.isWGS84
    ? extent
    : webMercatorUtils.webMercatorToGeographic(extent);
  const minLon = geoExtent.xmin;
  const minLat = geoExtent.ymin;
  const maxLon = geoExtent.xmax;
  const maxLat = geoExtent.ymax;
  const query = `[
    out:json][timeout:25];
    (
      way["highway"~"^(path|track)$"](${minLat},${minLon},${maxLat},${maxLon});
    );
    out geom;`;

  const url = "https://overpass-api.de/api/interpreter";
  const response = await esriRequest(url, {
    method: "post",
    responseType: "json",
    timeout: 30000,
    query: { data: query }
  });

  // Convert Overpass JSON to GeoJSON FeatureCollection (LineString)
  const elements = response.data.elements || [];
  const features = elements
    .filter(e => e.type === "way" && Array.isArray(e.geometry))
    .map(e => ({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: e.geometry.map(pt => [pt.lon, pt.lat])
      },
      properties: {
        id: e.id,
        highway: e.tags?.highway || null,
        name: e.tags?.name || null,
        surface: e.tags?.surface || null
      }
    }));

  return {
    type: "FeatureCollection",
    features
  };
}

let osmLayer;
let lastQueryKey;
const MIN_FETCH_ZOOM = 13; // only fetch/draw when sufficiently zoomed in

async function loadOSMLayerForView() {
  try {
    let viewExtent = appConfig.activeView.extent;
    if (!viewExtent) return;
    // Skip fetching when zoomed out for performance
    if (appConfig.activeView.zoom < MIN_FETCH_ZOOM) {
      if (osmLayer) {
        appConfig.activeView.map.remove(osmLayer);
        URL.revokeObjectURL(osmLayer.url);
        osmLayer = null;
      }
      return;
    }
    const LIMIT_TO_USA = true; // restrict queries to USA
    // Convert view extent to geographic for intersection math
    const geoViewExtent = webMercatorUtils.webMercatorToGeographic(viewExtent);
    let queryExtent = geoViewExtent;
    if (LIMIT_TO_USA) {
      const usa = { xmin: -179.0, ymin: 18.0, xmax: -66.0, ymax: 72.0 };
      const xmin = Math.max(geoViewExtent.xmin, usa.xmin);
      const ymin = Math.max(geoViewExtent.ymin, usa.ymin);
      const xmax = Math.min(geoViewExtent.xmax, usa.xmax);
      const ymax = Math.min(geoViewExtent.ymax, usa.ymax);
      if (xmin >= xmax || ymin >= ymax) {
        // Outside USA; nothing to query
        if (osmLayer) {
          appConfig.activeView.map.remove(osmLayer);
          URL.revokeObjectURL(osmLayer.url);
          osmLayer = null;
        }
        return;
      }
      queryExtent = { xmin, ymin, xmax, ymax, spatialReference: { wkid: 4326, isWGS84: true } };
    }
    // Deduplicate requests: round bbox to ~100m precision
    const rx = v => Math.round(v * 1000) / 1000;
    const key = `${rx(queryExtent.xmin)},${rx(queryExtent.ymin)},${rx(queryExtent.xmax)},${rx(queryExtent.ymax)}|z${appConfig.activeView.zoom}`;
    if (key === lastQueryKey) return;
    lastQueryKey = key;

    const geojson = await fetchOSMGeoJSON(queryExtent);
    const blob = new Blob([JSON.stringify(geojson)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    // Remove old layer if exists
    if (osmLayer) {
      appConfig.activeView.map.remove(osmLayer);
      URL.revokeObjectURL(osmLayer.url);
    }

    osmLayer = new GeoJSONLayer({
      url,
      title: "OSM Paths/Tracks",
      renderer: {
        type: "unique-value",
        field: "highway",
        defaultSymbol: { type: "simple-line", color: "#6e6e6e", width: 1.5 },
        uniqueValueInfos: [
          { value: "path", symbol: { type: "simple-line", color: "#2e7d32", width: 2 } },
          { value: "track", symbol: { type: "simple-line", color: "#8d6e63", width: 2 } }
        ]
      },
      popupTemplate: {
        title: "{name}",
        content: [
          { type: "fields", fieldInfos: [
            { fieldName: "highway", label: "Type" },
            { fieldName: "surface", label: "Surface" },
            { fieldName: "id", label: "OSM Way ID" }
          ]}
        ]
      }
    });

    appConfig.activeView.map.add(osmLayer);
  } catch (e) {
    console.error("Failed to load OSM data", e);
  }
}


// Setup event listeners for the current view
function setupViewListeners() {
  appConfig.activeView.when(loadOSMLayerForView);

// Refresh OSM data when user stops navigating (debounced)
let refreshHandle;
  appConfig.activeView.watch("stationary", (isStationary) => {
  if (isStationary) {
    clearTimeout(refreshHandle);
    refreshHandle = setTimeout(loadOSMLayerForView, 500);
  }
});
}

// Initialize with 2D view
setupViewListeners();




