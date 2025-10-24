// ============================================================================
// IMPORTS AND INITIALIZATION
// ============================================================================

// Import required modules
const [GeoJSONLayer, esriRequest, webMercatorUtils, Graphic, reactiveUtils, FeatureLayer, LayerList, Expand] = await $arcgis.import([
  "@arcgis/core/layers/GeoJSONLayer.js",
  "@arcgis/core/request.js",
  "@arcgis/core/geometry/support/webMercatorUtils.js",
  "@arcgis/core/Graphic.js",
  "@arcgis/core/core/reactiveUtils.js",
  "@arcgis/core/layers/FeatureLayer.js",
  "@arcgis/core/widgets/LayerList.js",
  "@arcgis/core/widgets/Expand.js"
]);

// Global variables
let mapView = null;
let isReportMode = false;
let isTapMapMode = false;
let selectedPoint = null;
let selectedPointGraphic = null;
let osmLayer = null;
let lastQueryKey = null;
let currentBlobUrl = null;
let didAutoLocate = false;

// Constants
const MIN_FETCH_ZOOM = window.matchMedia("(pointer: coarse)").matches ? 14 : 13;
const COUNTIES_SERVICE_URL = "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Counties_Generalized_Boundaries/FeatureServer/0";
const REPORTS_LAYER_URL = "https://services9.arcgis.com/6EuFgO4fLTqfNOhu/arcgis/rest/services/Trail_Issue_Reports/FeatureServer/0";

// Initialize map
const mapEl = document.querySelector("arcgis-map");
if (mapEl) {
  await new Promise((resolve) => {
    mapEl.addEventListener('arcgisViewReadyChange', (event) => {
      mapView = mapEl.view;
      if (mapView?.popup) {
        mapView.popup.autoOpenEnabled = false;
      }
      resolve();
    }, { once: true });
  });
  
  // Auto-trigger locate
  setTimeout(async () => {
    try {
      const locateEl = document.querySelector("arcgis-locate");
      if (locateEl?.locate) {
        await locateEl.locate();
      }
    } catch (error) {
      console.log('Auto-locate failed:', error);
    } finally {
      const loadingOverlay = document.getElementById('loadingOverlay');
      if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
        setTimeout(() => loadingOverlay.remove(), 300);
      }
    }
  }, 1000);
} else {
  console.error('arcgis-map element not found!');
}

// App configuration
const appConfig = { activeView: mapView, mapView };

// ============================================================================
// LAYER CONFIGURATION
// ============================================================================

// Reports layer configuration
const reportsLayer = new FeatureLayer({
  url: REPORTS_LAYER_URL,
  title: "Trail Issue Reports",
  outFields: ["*"],
  renderer: {
    type: "unique-value",
    field: "severity",
    defaultSymbol: { 
      type: "simple-marker", 
      color: [128, 128, 128, 0.8],
      size: 10,
      outline: { color: [255, 255, 255, 1], width: 2 }
    },
    uniqueValueInfos: [
      { value: "low", symbol: { type: "simple-marker", color: [76, 175, 80, 0.8], size: 10, outline: { color: [255, 255, 255, 1], width: 2 } } },
      { value: "medium", symbol: { type: "simple-marker", color: [255, 193, 7, 0.8], size: 10, outline: { color: [255, 255, 255, 1], width: 2 } } },
      { value: "high", symbol: { type: "simple-marker", color: [255, 152, 0, 0.8], size: 10, outline: { color: [255, 255, 255, 1], width: 2 } } },
      { value: "critical", symbol: { type: "simple-marker", color: [244, 67, 54, 0.8], size: 10, outline: { color: [255, 255, 255, 1], width: 2 } } }
    ]
  },
  popupTemplate: {
    title: "{issue_type} - {created_date}",
    content: [{ type: "fields", fieldInfos: [
      { fieldName: "issue_type", label: "Issue Type" },
      { fieldName: "description", label: "Description" },
      { fieldName: "severity", label: "Severity" },
      { fieldName: "status", label: "Status" },
      { fieldName: "reporter_name", label: "Reporter" },
      { fieldName: "state", label: "State" },
      { fieldName: "county", label: "County" }
    ]}]
  }
});

// Add layers to map
if (mapView) {
  mapView.map.add(reportsLayer);
  mapView.map.layers.on("after-add", () => {
    if (reportsLayer && mapView.map.layers.includes(reportsLayer)) {
      mapView.map.reorder(reportsLayer, mapView.map.layers.length - 1);
    }
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Error handling
function handleFeatureLayerError(error) {
  console.error('Feature Layer Error:', error);
  if (error.message.includes('403')) return 'Access denied. The feature layer may not be public.';
  if (error.message.includes('404')) return 'Feature layer not found. Please check the service URL.';
  if (error.message.includes('network')) return 'Network error. Please check your connection.';
  return 'An error occurred while submitting the report.';
}

// Location selection
function setSelectedPoint(point) {
  selectedPoint = point;
  
  if (!point) {
    // Clear the graphic if point is null
    if (selectedPointGraphic) {
      mapView.graphics.remove(selectedPointGraphic);
      selectedPointGraphic = null;
    }
    return;
  }
  
  if (!selectedPointGraphic) {
    selectedPointGraphic = new Graphic({
      geometry: point,
      symbol: { 
        type: 'simple-marker', 
        color: [255, 0, 0, 0.8],
        size: 16,
        style: 'cross',
        outline: { color: [255, 0, 0, 0.8, 1], width: 3 }
      }
    });
    mapView.graphics.add(selectedPointGraphic);
  } else {
    selectedPointGraphic.geometry = point;
  }
  
  const notice = document.getElementById('locationNotice');
  if (notice && point) notice.removeAttribute('open');
}

// County lookup
async function deriveAdminForPoint(point) {
  try {
    const url = `${COUNTIES_SERVICE_URL}/query`;
    const params = new URLSearchParams({
      geometry: `${point.longitude},${point.latitude}`,
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'NAME,STATE_NAME',
      f: 'json'
    });
    
    const response = await fetch(`${url}?${params}`);
    const data = await response.json();
    
    if (data.error) {
      console.error('Counties service error:', data.error);
      return { state: null, county: null };
    }
    
    if (data.features?.length > 0) {
      const feature = data.features[0];
      return {
        state: feature.attributes.STATE_NAME,
        county: feature.attributes.NAME
      };
    }
    
    return { state: null, county: null };
  } catch (error) {
    console.error('County lookup error:', error);
    return { state: null, county: null };
  }
}

// UI updates
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

// Photo handling functions
function setupPhotoHandling() {
  const photoInput = document.getElementById('photoInput');
  const btnSelectPhoto = document.getElementById('btnSelectPhoto');
  const btnRemovePhoto = document.getElementById('btnRemovePhoto');
  const photoPreview = document.getElementById('photoPreview');
  const photoImage = document.getElementById('photoImage');
  
  if (btnSelectPhoto) {
    btnSelectPhoto.addEventListener('click', () => {
      photoInput.click();
    });
  }
  
  if (photoInput) {
    photoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          photoImage.src = e.target.result;
          photoPreview.style.display = 'block';
          btnSelectPhoto.textContent = 'Change Photo';
        };
        reader.readAsDataURL(file);
      }
    });
  }
  
  if (btnRemovePhoto) {
    btnRemovePhoto.addEventListener('click', () => {
      photoInput.value = '';
      photoPreview.style.display = 'none';
      photoImage.src = '';
      btnSelectPhoto.textContent = 'Select Photo';
    });
  }
}

// Form reset function
function resetForm() {
  // Clear all form fields
  const issueType = document.getElementById('issueType');
  const issueDesc = document.getElementById('issueDesc');
  const severity = document.getElementById('severity');
  const reporterName = document.getElementById('reporterName');
  const reporterEmail = document.getElementById('reporterEmail');
  const photoInput = document.getElementById('photoInput');
  const photoPreview = document.getElementById('photoPreview');
  const photoImage = document.getElementById('photoImage');
  const btnSelectPhoto = document.getElementById('btnSelectPhoto');
  
  if (issueType) issueType.value = '';
  if (issueDesc) issueDesc.value = '';
  if (severity) severity.value = 'medium';
  if (reporterName) reporterName.value = '';
  if (reporterEmail) reporterEmail.value = '';
  
  // Clear photo
  if (photoInput) photoInput.value = '';
  if (photoPreview) photoPreview.style.display = 'none';
  if (photoImage) photoImage.src = '';
  if (btnSelectPhoto) btnSelectPhoto.textContent = 'Select Photo';
  
  // Reset location state
  setSelectedPoint(null);
  updateLocationStatus('No location set');
  
  // Reset tap map mode
  isTapMapMode = false;
  const btnTapMap = document.getElementById('btnTapMap');
  if (btnTapMap) {
    btnTapMap.appearance = 'outline';
  }
  
  // Clear derived admin info
  const derivedAdmin = document.getElementById('derivedAdmin');
  if (derivedAdmin) {
    derivedAdmin.style.display = 'none';
  }
  
  // Reset global state
  window.__derivedAdmin = {};
}

// Panel management
function hidePanel() {
  const panel = document.getElementById('controlPanel');
  if (!panel) return;
  panel.hidden = true;
  panel.style.transform = '';
  panel.style.opacity = '';
  isReportMode = false;
  
  // Reset form when panel is closed
  resetForm();
}

function showPanel() {
  const panel = document.getElementById('controlPanel');
  if (!panel) return;
  panel.hidden = false;
  isReportMode = true;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

// Map click handler
async function handleMapClick(event) {
  try {
    if (isTapMapMode && isReportMode) {
      setSelectedPoint(event.mapPoint);
      const { state, county } = await deriveAdminForPoint(event.mapPoint);
      updateAdminUI({ STATE_NAME: state }, { NAME: county });
      updateLocationStatus('Location set from map - tap again to change');
    }
  } catch (error) {
    console.error('Error handling map click:', error);
  }
}

// Setup map click handlers
if (mapView) {
  mapView.on("click", handleMapClick);
}

// Search component setup
const searchEl = document.querySelector("arcgis-search");
if (searchEl) {
  if (searchEl.componentOnReady) {
    await searchEl.componentOnReady();
  }

  // Configure search component
  searchEl.popupDisabled = true;
  searchEl.setAttribute('popup-disabled', '');
  searchEl.resultGraphicDisabled = true;
  searchEl.setAttribute('result-graphic-disabled', '');
  searchEl.popupTemplate = null;
  searchEl.autoSelectDisabled = false;

  // Close popups on search complete
  searchEl.addEventListener('arcgisSearchComplete', () => {
    const popup = mapView?.popup;
    if (popup) {
      popup.visible = false;
      if (typeof popup.close === 'function') popup.close();
    }
  });

  // Handle search results
  searchEl.addEventListener('arcgisSelectResult', async (e) => {
    try {
      const popup = mapView?.popup;
      if (popup) {
        popup.visible = false;
        if (typeof popup.close === 'function') popup.close();
      }
      const result = e.detail?.result;
      const geom = result?.feature?.geometry || result?.extent?.center;
      if (!geom) return;

      await mapView.goTo({ target: geom, zoom: Math.max(mapView.zoom, MIN_FETCH_ZOOM) });
      const pt = geom.type === 'point' ? geom : mapView.center;
      setSelectedPoint(pt);
      const { state, county } = await deriveAdminForPoint(pt);
      updateAdminUI({ STATE_NAME: state }, { NAME: county });
      await loadOSMLayerForView();
    } catch (error) {
      console.error('Error handling search result:', error);
    }
  });
}

// Locate component setup
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
      
      if (window._useCurrentLocationTriggered) {
        setSelectedPoint(pt);
        const { state, county } = await deriveAdminForPoint(pt);
        updateAdminUI({ STATE_NAME: state }, { NAME: county });
        updateLocationStatus('Using current location');
        window._useCurrentLocationTriggered = false;
      }
      await loadOSMLayerForView();
    }
  });
}

// ============================================================================
// FORM SUBMISSION
// ============================================================================

// Submit button handler
      const btnSubmit = document.getElementById('btnSubmit');
if (btnSubmit) {
  btnSubmit.addEventListener('click', async () => {
    try {
      // Get form values
      const formData = {
        issueType: document.getElementById('issueType')?.value || '',
        description: document.getElementById('issueDesc')?.value || '',
        severity: document.getElementById('severity')?.value || 'medium',
        reporterName: document.getElementById('reporterName')?.value || '',
        reporterEmail: document.getElementById('reporterEmail')?.value || '',
        photoFile: document.getElementById('photoInput')?.files[0] || null
      };
      
          const info = window.__derivedAdmin || {};
      
      // Validation
      if (!selectedPoint) {
        alert('Please set a location first.');
        return;
      }
      
      if (!formData.description.trim()) {
        alert('Please provide a description of the issue.');
        return;
      }
      
      // Create feature for submission
      const reportFeature = {
        geometry: selectedPoint,
        attributes: {
          issue_type: formData.issueType,
          description: formData.description,
          severity: formData.severity,
          status: 'new',
          reporter_name: formData.reporterName || null,
          reporter_email: formData.reporterEmail || null,
            state: info.stateName || null,
          county: info.countyName || null,
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString()
        }
      };
      
      // Show loading state
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Submitting...';
      
      // Submit to feature layer
      const result = await reportsLayer.applyEdits({
        addFeatures: [reportFeature]
      });
      
      if (result.addFeatureResults?.length > 0) {
        alert('Report submitted successfully! Thank you for helping maintain the trails.');
        
        // Clear form
        document.getElementById('issueType').value = '';
        document.getElementById('issueDesc').value = '';
        document.getElementById('severity').value = 'medium';
        document.getElementById('reporterName').value = '';
        document.getElementById('reporterEmail').value = '';
        setSelectedPoint(null);
        updateLocationStatus('No location set');
        hidePanel();
      } else {
        throw new Error('Failed to submit report');
      }
      
    } catch (error) {
      console.error('Error submitting report:', error);
      const errorMessage = handleFeatureLayerError(error);
      alert(errorMessage);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Submit report';
    }
  });
}


// ============================================================================
// OSM LAYER MANAGEMENT
// ============================================================================

// Fetch OSM data from Overpass API
async function fetchOSMGeoJSON(extent) {
  const geoExtent = extent.spatialReference?.isWGS84
    ? extent
    : webMercatorUtils.webMercatorToGeographic(extent);
    
  const { xmin: minLon, ymin: minLat, xmax: maxLon, ymax: maxLat } = geoExtent;
  const query = `[out:json][timeout:25];
    (
      way["highway"="path"](${minLat},${minLon},${maxLat},${maxLon});
      way["highway"="footway"]["footway"!="sidewalk"]["footway"!="crossing"]["footway"!="traffic_island"](${minLat},${minLon},${maxLat},${maxLon});
    );
    out geom;`;

  const response = await esriRequest("https://overpass-api.de/api/interpreter", {
    method: "post",
    responseType: "json",
    timeout: 30000,
    query: { data: query }
  });

  const elements = response.data.elements || [];
  const features = elements
    .filter(e => e.type === "way" && Array.isArray(e.geometry) && e.geometry.length >= 2)
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
        surface: e.tags?.surface || null,
        footway: e.tags?.footway || null
      }
    }))
    .filter(f => f.geometry.coordinates.length >= 2);

  return { type: "FeatureCollection", features };
}

// Load OSM layer for current view
async function loadOSMLayerForView() {
  try {
    const viewExtent = appConfig.activeView.extent;
    if (!viewExtent) return;
    
    // Skip fetching when zoomed out for performance
    if (appConfig.activeView.zoom < MIN_FETCH_ZOOM) {
      if (osmLayer) {
        appConfig.activeView.map.remove(osmLayer);
        osmLayer = null;
      }
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
      }
      return;
    }
    
    // Limit queries to USA
    const geoViewExtent = webMercatorUtils.webMercatorToGeographic(viewExtent);
      const usa = { xmin: -179.0, ymin: 18.0, xmax: -66.0, ymax: 72.0 };
      const xmin = Math.max(geoViewExtent.xmin, usa.xmin);
      const ymin = Math.max(geoViewExtent.ymin, usa.ymin);
      const xmax = Math.min(geoViewExtent.xmax, usa.xmax);
      const ymax = Math.min(geoViewExtent.ymax, usa.ymax);
    
      if (xmin >= xmax || ymin >= ymax) {
        if (osmLayer) {
          appConfig.activeView.map.remove(osmLayer);
          osmLayer = null;
        }
        if (currentBlobUrl) {
          URL.revokeObjectURL(currentBlobUrl);
          currentBlobUrl = null;
        }
        return;
      }
    
    const queryExtent = { xmin, ymin, xmax, ymax, spatialReference: { wkid: 4326, isWGS84: true } };
    
    // Deduplicate requests
    const rx = v => Math.round(v * 1000) / 1000;
    const key = `${rx(queryExtent.xmin)},${rx(queryExtent.ymin)},${rx(queryExtent.xmax)},${rx(queryExtent.ymax)}|z${appConfig.activeView.zoom}`;
    if (key === lastQueryKey) return;
    lastQueryKey = key;

    const geojson = await fetchOSMGeoJSON(queryExtent);
    
    if (!geojson.features?.length) {
      if (osmLayer) {
        appConfig.activeView.map.remove(osmLayer);
        osmLayer = null;
      }
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
      }
      return;
    }
    
    const blob = new Blob([JSON.stringify(geojson)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    if (osmLayer) {
      appConfig.activeView.map.remove(osmLayer);
      osmLayer = null;
    }
    
    if (currentBlobUrl) {
      setTimeout(() => URL.revokeObjectURL(currentBlobUrl), 2000);
    }
    currentBlobUrl = url;

    osmLayer = new GeoJSONLayer({
      url,
      title: "OSM Paths/Tracks",
      fields: [
        { name: "id", type: "string" },
        { name: "highway", type: "string" },
        { name: "name", type: "string" },
        { name: "surface", type: "string" },
        { name: "footway", type: "string" }
      ],
      renderer: {
        type: "unique-value",
        field: "highway",
        defaultSymbol: { type: "simple-line", color: "#6e6e6e", width: 2, style: "dash" },
        uniqueValueInfos: [
          { value: "path", symbol: { type: "simple-line", color: "#2e7d32", width: 2, style: "dash" } },
          { value: "footway", symbol: { type: "simple-line", color: "#ff6f00", width: 2, style: "dash" } }
        ]
      },
      popupTemplate: {
        title: "{name}",
        content: [{ type: "fields", fieldInfos: [
            { fieldName: "highway", label: "Highway Type" },
            { fieldName: "footway", label: "Footway Type" },
            { fieldName: "surface", label: "Surface" },
            { fieldName: "id", label: "OSM Way ID" }
        ]}]
      }
    });

    osmLayer.load()
      .then(() => {
        console.log('OSM layer loaded successfully');
        appConfig.activeView.map.add(osmLayer);
      })
      .catch(err => {
        console.warn('OSM layer failed to load:', err.message);
      });
  } catch (e) {
    console.error("Failed to load OSM data", e);
  }
}


// ============================================================================
// VIEW LISTENERS
// ============================================================================

// Setup view listeners
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

// Initialize view listeners
setupViewListeners();

// ============================================================================
// LAYER LIST WIDGET
// ============================================================================

// Create and add LayerList widget with Expand
if (mapView) {
  const layerList = new LayerList({
    view: mapView,
    visibilityAppearance: "checkbox",
    listItemCreatedFunction: (event) => {
      const item = event.item;
      if (item.layer === reportsLayer) {
        item.title = "Trail Issue Reports";
      } else if (item.layer === osmLayer) {
        item.title = "OSM Trails";
      }
    }
  });
  
  // Create Expand widget to contain the LayerList
  const expand = new Expand({
    view: mapView,
    content: layerList,
    expandIcon: "layers",
    expandTooltip: "Layers",
    collapsed: true
  });
  
  // Add Expand widget to the top-left corner of the view
  mapView.ui.add(expand, {
    position: "top-left",
    index: 1 // Position it below the locate button
  });
}

// ============================================================================
// DOM EVENT LISTENERS
// ============================================================================

// Initialize DOM event listeners
setTimeout(() => {
  const isMobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  const panel = document.getElementById('controlPanel');
  const btnReport = document.getElementById('btnReport');
  
  // Hide panel by default
  if (panel) panel.hidden = true;
  
  // Setup photo handling
  setupPhotoHandling();
  
  // Panel close button (event delegation)
  if (panel) {
    panel.addEventListener('click', (e) => {
      const target = e.target;
      if (target.id === 'btnHidePanel' || target.closest('#btnHidePanel')) {
        e.preventDefault();
        e.stopPropagation();
        hidePanel();
      }
    });
  }
  
  // Report button
  if (btnReport) {
    btnReport.addEventListener('click', (e) => { 
      e.preventDefault();
      e.stopPropagation();
      showPanel(); 
    }, { capture: true });
  }
  
  // Fallback delegate for report button
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;
    if (t.id === 'btnReport' || t.closest?.('#btnReport')) {
      e.preventDefault();
      e.stopPropagation();
      const p = document.getElementById('controlPanel');
      if (p) { 
        p.hidden = false; 
        isReportMode = true;
      }
    }
  }, { capture: true });

  // Use Current Location button
  const btnUseCurrentLocation = document.getElementById('btnUseCurrentLocation');
  if (btnUseCurrentLocation) {
    btnUseCurrentLocation.addEventListener('click', async () => {
      try {
      window._useCurrentLocationTriggered = true;
        
        if (navigator.geolocation) {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 300000
            });
          });
          
          const { longitude, latitude } = position.coords;
          const point = {
            type: "point",
            longitude: longitude,
            latitude: latitude,
            spatialReference: { wkid: 4326 }
          };
          
          setSelectedPoint(point);
          const { state, county } = await deriveAdminForPoint(point);
          updateAdminUI({ STATE_NAME: state }, { NAME: county });
          updateLocationStatus('Using current location');
          
          if (mapView.zoom < MIN_FETCH_ZOOM) {
            await mapView.goTo({ target: point, zoom: MIN_FETCH_ZOOM });
          } else {
            await mapView.goTo({ target: point });
          }
          
          await loadOSMLayerForView();
        } else {
      const locateEl2 = document.querySelector("arcgis-locate");
      if (locateEl2) {
        locateEl2.locate();
          }
        }
      } catch (error) {
        console.error('Error getting current location:', error);
        alert('Unable to get your current location. Please try using "Tap map" instead.');
      }
    });
  }

  // Tap Map button
  const btnTapMap = document.getElementById('btnTapMap');
  if (btnTapMap) {
    btnTapMap.addEventListener('click', () => {
      isTapMapMode = !isTapMapMode;
      if (isTapMapMode) {
        btnTapMap.appearance = 'solid';
        updateLocationStatus('Tap the map to set location');
        document.getElementById('locationText').style.color = '#ffc107';
      } else {
        btnTapMap.appearance = 'outline';
        updateLocationStatus('No location set');
        document.getElementById('locationText').style.color = '#bdbdbd';
        // Clear selected point when exiting tap mode
        setSelectedPoint(null);
        updateLocationStatus('No location set');
      }
    });
  }

  // Mobile drag-to-dismiss
  if (isMobile && panel) {
    const header = panel.querySelector('.panel-top');
    let startY = 0;
    let currentY = 0;
    let dragging = false;
    const threshold = 60;

    const onTouchStart = (e) => {
      if (!e.touches?.length) return;
      dragging = true;
      startY = e.touches[0].clientY;
      currentY = startY;
      panel.style.transition = 'none';
    };
    
    const onTouchMove = (e) => {
      if (!dragging) return;
      currentY = e.touches[0].clientY;
      const dy = Math.max(0, currentY - startY);
      panel.style.transform = `translateY(${dy}px)`;
      panel.style.opacity = String(Math.max(0.5, 1 - dy / 250));
    };
    
    const onTouchEnd = () => {
      if (!dragging) return;
      dragging = false;
      const dy = Math.max(0, currentY - startY);
      panel.style.transition = '';
      
      if (dy > threshold) {
        hidePanel();
      } else {
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
