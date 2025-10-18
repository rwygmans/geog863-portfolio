// Import required modules for OSM and graphics
const [GeoJSONLayer, esriRequest, webMercatorUtils, Graphic, reactiveUtils] = await $arcgis.import([
  "@arcgis/core/layers/GeoJSONLayer.js",
  "@arcgis/core/request.js",
  "@arcgis/core/geometry/support/webMercatorUtils.js",
  "@arcgis/core/Graphic.js",
  "@arcgis/core/core/reactiveUtils.js"
]);

// Get the arcgis-map element and wait for it to be ready
const mapEl = document.querySelector("arcgis-map");
let mapView = null;

// Wait for the map component to be ready - proper way
if (mapEl) {
  await new Promise((resolve) => {
    mapEl.addEventListener('arcgisViewReadyChange', (event) => {
      console.log('arcgisViewReadyChange event:', event);
      mapView = mapEl.view;
      console.log('MapView initialized:', mapView);
      resolve();
    }, { once: true });
  });
} else {
  console.error('arcgis-map element not found!');
}

// App configuration for view management
const appConfig = {
  activeView: mapView,
  mapView: mapView
};

// (State and county layers removed)

let isReportMode = false;
let isTapMapMode = false;
let selectedPoint = null;
let selectedPointGraphic = null;
const MIN_FETCH_ZOOM = window.matchMedia("(pointer: coarse)").matches ? 14 : 13; // touch devices fetch later
let didAutoLocate = false;

// Setup click handler: when in tap-map mode, a tap sets the report location
function setupStateClickHandlers() { mapView.on("click", (event) => handleMapClick(event)); }

// Helpers


async function handleMapClick(event) {
  try {
    if (isTapMapMode) {
      setSelectedPoint(event.mapPoint);
      const { state, county } = await deriveAdminForPoint(event.mapPoint);
      updateAdminUI(state, county);
      updateLocationStatus('Location set from map');
      isTapMapMode = false;
      const btnTapMap = document.getElementById('btnTapMap');
      if (btnTapMap) btnTapMap.appearance = 'outline';
      return;
    }
    // When not in tap-map mode, ignore map taps
  } catch (error) {
    console.error('Error handling map click:', error);
  }
}

// Setup click handlers and component listeners
if (mapView) {
  console.log('MapView is ready, setting up click handlers');
  setupStateClickHandlers();
} else {
  console.error('MapView not available, cannot setup click handlers');
}

// Listen for search results
const searchEl = document.querySelector("arcgis-search");
if (searchEl) {
  searchEl.addEventListener('arcgisSelect', async (e) => {
    try {
      const geom = e.detail?.result?.feature?.geometry || e.detail?.result?.extent?.center;
          if (!geom) return;
      await mapView.goTo({ target: geom, zoom: Math.max(mapView.zoom, MIN_FETCH_ZOOM) });
          const pt = geom.type === 'point' ? geom : mapView.center;
          setSelectedPoint(pt);
          const { state, county } = await deriveAdminForPoint(pt);
          updateAdminUI(state, county);
      await loadOSMLayerForView();
        } catch {}
      });
}

// Listen for locate events
const locateEl = document.querySelector("arcgis-locate");
if (locateEl) {
  locateEl.addEventListener('arcgisLocate', async (e) => {
    const pt = e.detail?.position || mapView.center;
    if (pt) {
      didAutoLocate = true;
      if (mapView.zoom < MIN_FETCH_ZOOM) {
        await mapView.goTo({ target: pt, zoom: MIN_FETCH_ZOOM });
      } else {
        await mapView.goTo({ target: pt });
      }
      // Only set point if triggered from "Use Current Location" button
      if (window._useCurrentLocationTriggered) {
        setSelectedPoint(pt);
        const { state, county } = await deriveAdminForPoint(pt);
        updateAdminUI(state, county);
        updateLocationStatus('Using current location');
        window._useCurrentLocationTriggered = false;
      }
      await loadOSMLayerForView();
    }
  });
  
}

// Submit button
      const btnSubmit = document.getElementById('btnSubmit');
if (btnSubmit) {
  btnSubmit.addEventListener('click', () => {
        try {
          const typeEl = document.getElementById('issueType');
          const descEl = document.getElementById('issueDesc');
          const type = typeEl && ('value' in typeEl) ? typeEl.value : '';
          const desc = descEl && ('value' in descEl) ? descEl.value : '';
          const info = window.__derivedAdmin || {};
          if (!selectedPoint) { alert('Please set a location first.'); return; }
          const coords = webMercatorUtils.webMercatorToGeographic(selectedPoint);
          console.log('Report submitted', {
            type,
            desc,
            location: { x: coords.x, y: coords.y },
            state: info.stateName || null,
            stateFips: info.stateFips || null,
            county: info.countyName || null
          });
          alert('Report captured locally (console). Hook up backend to persist.');
          isReportMode = false;
        } catch {}
      });
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
  reactiveUtils.watch(
    () => appConfig.activeView.stationary,
    (isStationary) => {
      if (isStationary) {
        clearTimeout(refreshHandle);
        refreshHandle = setTimeout(loadOSMLayerForView, 500);
      }
    }
  );
}

// Initialize with 2D view
setupViewListeners();

function setSelectedPoint(point) {
  selectedPoint = point;
  if (!point) return;
  if (!selectedPointGraphic) {
    selectedPointGraphic = new Graphic({
      geometry: point,
      symbol: { type: 'simple-marker', color: [0, 122, 255, 1], size: 10, outline: { color: [255,255,255,1], width: 2 } }
    });
    mapView.graphics.add(selectedPointGraphic);
  } else {
    selectedPointGraphic.geometry = point;
  }
  // Hide location hint once a point is set
  const notice = document.getElementById('locationNotice');
  if (notice && point) { notice.removeAttribute('open'); }
}

async function deriveAdminForPoint(point) {
  // State/county layers removed; return no admin info
    return { state: null, county: null };
}

function updateAdminUI(stateAttr, countyAttr) {
  const dState = document.getElementById('derivedState');
  const dCounty = document.getElementById('derivedCounty');
  const derivedAdmin = document.getElementById('derivedAdmin');
  const stateName = stateAttr?.STATE_NAME || stateAttr?.NAME || '';
  const stateFips = stateAttr?.STATE_FIPS ?? stateAttr?.STATEFP ?? null;
  const countyName = countyAttr?.NAME || '';
  if (dState) dState.textContent = `State: ${stateName || '—'}`;
  if (dCounty) dCounty.textContent = `County: ${countyName || '—'}`;
  if (derivedAdmin) derivedAdmin.style.display = (stateName || countyName) ? 'block' : 'none';
  window.__derivedAdmin = { stateName, stateFips, countyName };
}

function updateLocationStatus(message) {
  const locationText = document.getElementById('locationText');
  if (locationText) {
    locationText.textContent = message;
    locationText.style.color = '#4caf50';
  }
}

// Wait for DOM to be fully ready
setTimeout(() => {
  const isMobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  const panel = document.getElementById('controlPanel');
  const btnReport = document.getElementById('btnReport');
  
  // Hide panel by default on all devices; user must tap Report
  if (panel) panel.hidden = true;
  
  const hidePanel = () => {
    console.log('hidePanel called');
    if (!panel) return;
    panel.hidden = true;
    panel.style.transform = '';
    panel.style.opacity = '';
    isReportMode = false;
  };
  
  const showPanel = () => {
    console.log('showPanel called');
    if (!panel) return;
    panel.hidden = false;
    isReportMode = true;
  };
  
  // Use event delegation on the panel itself for the close button
  if (panel) {
    panel.addEventListener('click', (e) => {
      const target = e.target;
      if (target.id === 'btnHidePanel' || target.closest('#btnHidePanel')) {
        console.log('Close button clicked via delegation');
        e.preventDefault();
        e.stopPropagation();
        hidePanel();
      }
    });
  }
  
  console.log('btnReport element:', btnReport);
  if (btnReport) {
    console.log('Adding click listener to btnReport');
    btnReport.addEventListener('click', (e) => { 
      console.log('Report button clicked - direct listener');
      e.preventDefault();
      e.stopPropagation();
      showPanel(); 
    }, { capture: true });
  } else {
    console.error('btnReport not found!');
  }
  
  // Fallback delegate: ensure clicking the Report button always opens the panel
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;
    // Check if click is on or inside btnReport
    if (t.id === 'btnReport' || (t.closest && t.closest('#btnReport'))) {
      console.log('Report button clicked - delegated listener');
      e.preventDefault();
      e.stopPropagation();
      const p = document.getElementById('controlPanel');
      if (p) { 
        p.hidden = false; 
        isReportMode = true;
        console.log('Panel opened via delegate');
      }
    }
  }, { capture: true });

  // "Use Current Location" button
  const btnUseCurrentLocation = document.getElementById('btnUseCurrentLocation');
  if (btnUseCurrentLocation) {
    btnUseCurrentLocation.addEventListener('click', () => {
      console.log('Use current location clicked');
      window._useCurrentLocationTriggered = true;
      const locateEl2 = document.querySelector("arcgis-locate");
      if (locateEl2) {
        locateEl2.locate();
      }
    });
  }

  // "Tap Map" button
  const btnTapMap = document.getElementById('btnTapMap');
  if (btnTapMap) {
    btnTapMap.addEventListener('click', () => {
      console.log('Tap map clicked');
      isTapMapMode = !isTapMapMode;
      if (isTapMapMode) {
        btnTapMap.appearance = 'solid';
        updateLocationStatus('Tap the map to set location');
        document.getElementById('locationText').style.color = '#ffc107';
      } else {
        btnTapMap.appearance = 'outline';
        updateLocationStatus('No location set');
        document.getElementById('locationText').style.color = '#bdbdbd';
      }
    });
  }

  // Drag-to-dismiss: drag the panel header downward to close
  if (isMobile && panel) {
    const header = panel.querySelector('.panel-top');
    let startY = 0;
    let currentY = 0;
    let dragging = false;
    const threshold = 60; // px to trigger dismiss

    const onTouchStart = (e) => {
      if (!e.touches || e.touches.length === 0) return;
      dragging = true;
      startY = e.touches[0].clientY;
      currentY = startY;
      panel.style.transition = 'none';
    };
    
    const onTouchMove = (e) => {
      if (!dragging) return;
      currentY = e.touches[0].clientY;
      const dy = Math.max(0, currentY - startY); // only allow downward drag
      panel.style.transform = `translateY(${dy}px)`;
      panel.style.opacity = String(Math.max(0.5, 1 - dy / 250));
    };
    
    const onTouchEnd = () => {
      if (!dragging) return;
      dragging = false;
      const dy = Math.max(0, currentY - startY);
      panel.style.transition = '';
      
      if (dy > threshold) {
        // Dismiss
        hidePanel();
      } else {
        // Snap back
        panel.style.transform = 'translateY(0)';
        panel.style.opacity = '';
      }
    };
    
    if (header) {
      header.addEventListener('touchstart', onTouchStart, { passive: true });
      header.addEventListener('touchmove', onTouchMove, { passive: true });
      header.addEventListener('touchend', onTouchEnd, { passive: true });
      header.addEventListener('touchcancel', onTouchEnd, { passive: true });
    }
  }
}, 500);




