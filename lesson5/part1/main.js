// ArcGIS Maps SDK 
const [SceneView, WebScene, VectorTileLayer] = await window.$arcgis.import([
    "@arcgis/core/views/SceneView.js",
    "@arcgis/core/WebScene.js",
    "@arcgis/core/layers/VectorTileLayer.js",
  ]);
  
  // Houston, TX
  const LONGITUDE = -95.3701;
  const LATITUDE = 29.7601;
  
  const TXDOT_ITEM_ID = "4bd376c56f314bc5a36446630db604a6";
  
  const txdotVTL = new VectorTileLayer({
    portalItem: { id: TXDOT_ITEM_ID },
    title: "TxDOT Vector Tile Basemap",
  });
  
  const scene = new WebScene({
    basemap: {
      baseLayers: [txdotVTL],
    },
    ground: "world-elevation",
  });
  
  const view = new SceneView({
    container: "viewDiv",
    map: scene,
    center: [LONGITUDE, LATITUDE],
    scale: 120000
  });
  
  await view.when();
  await view.goTo({ tilt: 45, heading: 20 }, { animate: false });
  
  
  
  
  

  


