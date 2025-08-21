import axios from "axios"
import * as Cesium from "cesium"
//import { initializeCommon } from "./common"

Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
Cesium.RequestScheduler.requestsByServer["tile.googleapis.com:443"] = 18

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

// GLASGOW coordinates - centered on River Liffey and south city center
const GLASGOW_LAT = 55.86087   // Moved further south to include more of south city center
const GLASGOW_LON = -4.24302  // Keeping the same longitude for river alignment
const INITIAL_GLASGOW_HEIGHT = 500 // Height in meters

//Function to setup a pause or wait function
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)); 



// Function to smoothly fly to GLASGOW
const flyToGlasgow = (viewer: any) => {
  return new Promise<void>((resolve) => {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(GLASGOW_LON, GLASGOW_LAT, INITIAL_GLASGOW_HEIGHT),
      orientation: {
        heading: Cesium.Math.toRadians(0.0),
        pitch: Cesium.Math.toRadians(-70.0),
        roll: 0.0
      },
      duration: 3.0,
      complete: () => {
        console.log('Camera animation to GLASGOW complete')
        resolve()
      }
    })
  })
}

const flyToTilt = (viewer: any) => {
  return new Promise<void>((resolve) => {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(GLASGOW_LON, GLASGOW_LAT, INITIAL_GLASGOW_HEIGHT),
      orientation: {
        heading: Cesium.Math.toRadians(0.0),
        pitch: Cesium.Math.toRadians(-50.0),
        roll: 0.0
      },
      duration: 1.0,
      complete: () => {
        console.log('Camera animation tilt complete')
        resolve()
      }
    })
  })
}

// Function to wait for terrain loading
const waitForTerrain = (viewer: any) => {
  return new Promise<void>((resolve) => {
    const terrainCheck = () => {
      if (viewer.scene.globe.tilesLoaded) {
        console.log('Terrain loaded, starting camera animation')
        resolve()
      } else {
        console.log('Waiting for terrain to load...')
        setTimeout(terrainCheck, 100)
      }
    }
    terrainCheck()
  })
}

export const init3dGoogleViewer = async () => {
  // **************** MAP INITIALIZATION ***************************************

  // Initialize the Cesium Viewer in the HTML element with the `cesiumContainer` ID.
  // NOTE: baseLayerPicker on the viewer must be false, and a Google 2D or 3D map must be used.
  // Google API results can only be shared on Google maps due to terms of service
  const viewer = new Cesium.Viewer("cesiumContainer", {
    // Keep the globe enabled for better context and navigation
    globe: new Cesium.Globe(Cesium.Ellipsoid.WGS84),
    // can turn timeline and animation back on if dealing with time-dependent data
    timeline: false,
    animation: false,
    // baseLayerPicker must be false to comply with Google API terms of service
    baseLayerPicker: false,
    // sceneModePicker is extra clutter, not really needed
    sceneModePicker: false,
    // geocoder must be Google for photorealistic tiles
    geocoder: Cesium.IonGeocodeProviderType.GOOGLE,
    navigationHelpButton: false,
    homeButton: false,
    scene3DOnly: true,
    selectionIndicator: false,
    infoBox: false
  })

  const tileset = await Cesium.createGooglePhotorealistic3DTileset({
    // Only the Google Geocoder can be used with Google Photorealistic 3D Tiles.
    // Set the `geocoder` property of the viewer constructor options to IonGeocodeProviderType.GOOGLE.
    onlyUsingWithGoogleGeocoder: true
  })

  // Load the Google Photorealistic 3D tileset as the basemap
  try {
    viewer.scene.primitives.add(tileset)
  } catch (error) {
    console.log(`Failed to load tileset: ${error}`)
  }

  // Enable zoom to ray-casted point on 3D surface
  viewer.scene.screenSpaceCameraController.enableCollisionDetection = true
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 1
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 40000000
  ;(viewer.scene.screenSpaceCameraController as any).enableInputs = true
  ;(viewer.scene.screenSpaceCameraController as any).zoomToCursorEnabled = true

  // Wait for terrain to load before flying to Glasgow 
  await waitForTerrain(viewer)
  await flyToGlasgow(viewer)
  await wait(250)
  await flyToTilt(viewer)
  

  // Add double-click handler for quick zoom
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
  handler.setInputAction((movement: { position: Cesium.Cartesian2; }) => {
    const pickedPosition = viewer.scene.pickPosition(movement.position)
    if (Cesium.defined(pickedPosition)) {
      const currentCameraPosition = viewer.camera.position
      const distance = Cesium.Cartesian3.distance(currentCameraPosition, pickedPosition)
      const direction = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.subtract(pickedPosition, currentCameraPosition, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      )
      const targetDistance = distance * 0.1 // Move 90% closer
      const targetPosition = Cesium.Cartesian3.add(
        currentCameraPosition,
        Cesium.Cartesian3.multiplyByScalar(direction, distance * 0.9, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      )
      
      viewer.camera.flyTo({
        destination: targetPosition,
        orientation: {
          heading: viewer.camera.heading,
          pitch: viewer.camera.pitch,
          roll: viewer.camera.roll
        },
        duration: 0.5
      })
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

  // Initialize common functionality (including tickets)
  //const { ticketManager } = initializeCommon(viewer)

  return {
    viewer,
    tileset,
    //ticketManager
  }
}

export const init2dGoogleViewer = async () => {
  // Obtain a session token for the Google Maps API
  const response = axios.post(`https://tile.googleapis.com/v1/createSession?key=${GOOGLE_MAPS_API_KEY}`, {
    mapType: "satellite",
    language: "en-US",
    region: "US"
  })
  const sessionToken = (await response).data.session

  const google2dTileProvider = new Cesium.WebMapTileServiceImageryProvider({
    url: `https://tile.googleapis.com/v1/2dtiles/{TileMatrix}/{TileCol}/{TileRow}?session=${sessionToken}&key=${GOOGLE_MAPS_API_KEY}`,
    layer: "Google_Maps_2D",
    style: "default",
    format: "image/png",
    tileMatrixSetID: "",
    maximumLevel: 19,
    credit: new Cesium.Credit("Google")
  })

  // **************** MAP INITIALIZATION ***************************************
  // Initialize the Cesium Viewer in the HTML element with the `cesiumContainer` ID.
  // NOTE: baseLayerPicker on the viewer must be false, and a Google 2D or 3D map must be used.
  // Google API results can only be shared on Google maps due to terms of service
  const viewer = new Cesium.Viewer("cesiumContainer", {
    // can turn timeline and animation back on if dealing with time-dependent data
    timeline: false,
    animation: false,
    baseLayer: new Cesium.ImageryLayer(google2dTileProvider),
    // baseLayerPicker must be false to comply with Google API terms of service
    baseLayerPicker: false,
    // sceneModePicker is extra clutter, not really needed
    sceneModePicker: false,
    // geocoder must be Google for photorealistic tiles
    geocoder: Cesium.IonGeocodeProviderType.GOOGLE
  })

  // Add accreditation for Google Maps API, do not remove
  const credit = new Cesium.Credit(
    `<img style="vertical-align:-5px" src="https://assets.ion.cesium.com/google-credit.png" alt="Google">`,
    true
  )
  viewer.creditDisplay.addStaticCredit(credit)

  // Wait for terrain to load before flying to Glasgow
  await waitForTerrain(viewer)
  await flyToGlasgow(viewer)
  

  // Initialize common functionality (including tickets)
  //const { ticketManager } = initializeCommon(viewer)

  return {
    viewer,
    //ticketManager
  }
}


