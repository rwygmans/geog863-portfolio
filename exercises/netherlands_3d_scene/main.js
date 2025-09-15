const [SceneView, WebScene] = await $arcgis.import([
  "@arcgis/core/views/SceneView.js",
  "@arcgis/core/WebScene.js",
]);

const titleDiv = document.getElementById("titleDiv");


/************************************************************
 * Creates a new WebScene instance. A WebScene must reference
 * a PortalItem ID that represents a WebScene saved to
 * arcgis.com or an on-premise portal.
 *
 * To load a WebScene from an on-premise portal, set the portal
 * url with esriConfig.portalUrl.
 ************************************************************/
const scene = new WebScene({
  portalItem: {
    // autocasts as new PortalItem()
    id: "94e00add11334767afb0abdce49c9a43",
  },
});

/************************************************************
 * Set the WebScene instance to the map property in a SceneView.
 ************************************************************/
const view = new SceneView({
  map: scene,
  container: "viewDiv",
  padding: {
    top: 40,
  },
});


view.when(function () {
  // when the scene and view resolve, display the scene's
  // title in the DOM
  const title = scene.portalItem.title;
  titleDiv.innerHTML = title;
});