const [MapView, WebMap] = await $arcgis.import([
  "@arcgis/core/views/MapView.js",
  "@arcgis/core/WebMap.js",
]);

/************************************************************
 * Creates a new WebMap instance. A WebMap must reference
 * a PortalItem ID that represents a WebMap saved to
 * arcgis.com or an on-premise portal.
 *
 * To load a WebMap from an on-premise portal, set the portal
 * url with esriConfig.portalUrl.
 ************************************************************/
const webmap = new WebMap({
  portalItem: {
    // autocasts as new PortalItem()
    id: "1cb05824ffe343d6bebe364b035823e9",
  },
});

/************************************************************
 * Set the WebMap instance to the map property in a MapView.
 ************************************************************/
const view = new MapView({
  map: webmap,
  container: "viewDiv",
});
