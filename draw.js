// window.CESIUM_BASE_URL = '/cesium';

// import {
//   Viewer,
//   Ion,
//   IonGeocodeProviderType,
//   Color,
//   PolygonHierarchy,
//   Cartographic,
//   Math as CesiumMath,
//   ScreenSpaceEventHandler,
//   ScreenSpaceEventType,
//   Cartesian3,
//   VerticalOrigin,
//   HeightReference
// } from "cesium";

// import "cesium/Build/Cesium/Widgets/widgets.css";

// Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;

// const viewer = new Viewer("cesiumContainer", {
//   timeline: false,
//   animation: false,
//   baseLayerPicker: false,
//   geocoder: IonGeocodeProviderType.GOOGLE,
//   sceneModePicker: false,
//   homeButton: false,
//   navigationHelpButton: false,
// });

// console.log("🛠️ Dev Draw Tool Viewer Initialized");

// const colors = [Color.RED, Color.GREEN, Color.BLUE, Color.ORANGE, Color.CYAN, Color.MAGENTA];
// let currentColorIndex = 0;

// let zones = [];
// let currentZone = {
//   id: 1,
//   points: [],
//   pin: null,
//   pinEntity: null,
//   polylineEntity: null
// };

// let placingPin = false;

// const counterEl = document.getElementById("counter");
// function updateCounter() {
//   const count = currentZone.points.length;
//   counterEl.innerText =
//     `🧭 Zone ${currentZone.id} – ${count} point(s) marked` +
//     (currentZone.pin ? " ✅ Pin placed" : " ⛔ No pin");
//   if (count === 0) {
//     counterEl.innerText = "🛑 No points marked. Click on map to begin.";
//   }
// }

// const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
// handler.setInputAction((click) => {
//   const pos = viewer.scene.pickPosition(click.position);
//   if (!pos) return;

//   if (placingPin) {
//     placePinManually(pos);
//     placingPin = false;
//     return;
//   }

//   currentZone.points.push(pos);
//   redrawCurrentPolyline();
//   updateCounter();
// }, ScreenSpaceEventType.LEFT_CLICK);

// function redrawCurrentPolyline() {
//   if (currentZone.polylineEntity)
//     viewer.entities.remove(currentZone.polylineEntity);

//   currentZone.polylineEntity = viewer.entities.add({
//     polyline: {
//       positions: currentZone.points,
//       width: 3,
//       material: Color.YELLOW,
//     },
//   });
// }

// function undoLastPoint() {
//   currentZone.points.pop();
//   redrawCurrentPolyline();
//   updateCounter();
// }

// function placePinManually(pos) {
//   if (currentZone.pinEntity) viewer.entities.remove(currentZone.pinEntity);

//   const carto = Cartographic.fromCartesian(pos);
//   const lng = CesiumMath.toDegrees(carto.longitude);
//   const lat = CesiumMath.toDegrees(carto.latitude);
//   currentZone.pin = [lng, lat];

//   currentZone.pinEntity = viewer.entities.add({
//     position: Cartesian3.fromDegrees(lng, lat, 500),
//     billboard: {
//       image: "https://upload.wikimedia.org/wikipedia/commons/e/ec/RedDot.svg",
//       scale: 0.8,
//       verticalOrigin: VerticalOrigin.BOTTOM,
//       heightReference: HeightReference.NONE,
//     },
//     description: `📌 Zone ${currentZone.id}`
//   });

//   console.log(`📍 Pin placed at [${lng}, ${lat}] for Zone ${currentZone.id}`);
//   updateCounter();
// }

// function finishPolygon() {
//   if (currentZone.points.length < 3) {
//     alert("Need at least 3 points to form a polygon.");
//     return;
//   }

//   const color = colors[currentColorIndex % colors.length];
//   currentColorIndex++;

//   const polygonEntity = viewer.entities.add({
//     polygon: {
//       hierarchy: new PolygonHierarchy(currentZone.points),
//       material: color.withAlpha(0.4),
//       outline: true,
//       outlineColor: Color.BLACK
//     }
//   });

//   zones.push({
//     id: `Zone-${currentZone.id}`,
//     coordinates: currentZone.points.map(pos => {
//       const carto = Cartographic.fromCartesian(pos);
//       return [CesiumMath.toDegrees(carto.longitude), CesiumMath.toDegrees(carto.latitude)];
//     }),
//     pin: currentZone.pin,
//     color: color.toCssColorString()
//   });

//   // Reset current zone
//   currentZone.id++;
//   currentZone.points = [];
//   currentZone.pin = null;
//   currentZone.pinEntity = null;
//   currentZone.polylineEntity = null;
//   updateCounter();
// }

// function exportGeoJSON() {
//   if (zones.length === 0) return alert("❌ No zones to export!");

//   const features = zones.map(zone => ({
//     type: "Feature",
//     properties: {
//       zoneId: zone.id,
//       pin: zone.pin,
//       color: zone.color
//     },
//     geometry: {
//       type: "Polygon",
//       coordinates: [[...zone.coordinates, zone.coordinates[0]]]
//     }
//   }));

//   const geojson = {
//     type: "FeatureCollection",
//     features
//   };

//   const blob = new Blob([JSON.stringify(geojson, null, 2)], {
//     type: "application/json"
//   });
//   const url = URL.createObjectURL(blob);
//   const link = document.createElement("a");
//   link.href = url;
//   link.download = "multi-zone.geojson";
//   document.body.appendChild(link);
//   link.click();
//   document.body.removeChild(link);

//   console.log("✅ Exported", zones.length, "zones.");
// }

// function clearAll() {
//   currentZone.points = [];
//   currentZone.pin = null;
//   zones = [];
//   viewer.entities.removeAll();
//   currentColorIndex = 0;
//   currentZone.id = 1;
//   placingPin = false;
//   updateCounter();
//   console.log("🧹 Cleared all zones.");
// }

// // === Buttons ===
// document.getElementById("undoBtn").onclick = undoLastPoint;
// document.getElementById("placePinBtn").onclick = () => {
//   if (currentZone.points.length === 0) {
//     alert("⚠️ You must draw a zone before placing a pin.");
//     return;
//   }
//   placingPin = true;
//   alert("🖱️ Click on map to place pin for current zone.");
// };
// document.getElementById("finishBtn").onclick = finishPolygon;
// document.getElementById("exportBtn").onclick = exportGeoJSON;
// document.getElementById("clearBtn").onclick = clearAll;

// updateCounter();
// ...your imports & viewer setup unchanged...
window.CESIUM_BASE_URL = '/cesium';

import {
  Viewer,
  Ion,
  IonGeocodeProviderType,
  Color,
  PolygonHierarchy,
  Cartographic,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartesian3,
  VerticalOrigin,
  HeightReference
} from "cesium";

import "cesium/Build/Cesium/Widgets/widgets.css";

Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;

const viewer = new Viewer("cesiumContainer", {
  timeline: false,
  animation: false,
  baseLayerPicker: false,
  geocoder: IonGeocodeProviderType.GOOGLE,
  sceneModePicker: false,
  homeButton: false,
  navigationHelpButton: false,
});

console.log("🛠️ Dev Draw Tool Viewer Initialized");

const colors = [Color.RED, Color.GREEN, Color.BLUE, Color.ORANGE, Color.CYAN, Color.MAGENTA];
let currentColorIndex = 0;

let zones = [];
let currentZone = {
  id: 1,
  points: [],
  pin: null,
  pinEntity: null,
  polylineEntity: null
};

let placingPin = false;

const counterEl = document.getElementById("counter");
function updateCounter() {
  const count = currentZone.points.length;
  counterEl.innerText =
    `🧭 Zone ${currentZone.id} – ${count} point(s) marked` +
    (currentZone.pin ? " ✅ Pin placed" : " ⛔ No pin");
  if (count === 0) {
    counterEl.innerText = "🛑 No points marked. Click on map to begin.";
  }
}

// === Mouse Interaction ===
const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
handler.setInputAction((click) => {
  const pos = viewer.scene.pickPosition(click.position);
  if (!pos) return;

  if (placingPin) {
    placePinManually(pos);
    placingPin = false;
    return;
  }

  currentZone.points.push(pos);
  redrawCurrentPolyline();
  updateCounter();
}, ScreenSpaceEventType.LEFT_CLICK);

function redrawCurrentPolyline() {
  if (currentZone.polylineEntity)
    viewer.entities.remove(currentZone.polylineEntity);

  currentZone.polylineEntity = viewer.entities.add({
    polyline: {
      positions: currentZone.points,
      width: 3,
      material: Color.YELLOW,
    },
  });
}

function undoLastPoint() {
  currentZone.points.pop();
  redrawCurrentPolyline();
  updateCounter();
}

function placePinManually(pos) {
  if (currentZone.pinEntity) viewer.entities.remove(currentZone.pinEntity);

  const carto = Cartographic.fromCartesian(pos);
  const lng = CesiumMath.toDegrees(carto.longitude);
  const lat = CesiumMath.toDegrees(carto.latitude);
  currentZone.pin = [lng, lat];

  currentZone.pinEntity = viewer.entities.add({
    position: Cartesian3.fromDegrees(lng, lat, 500),
    billboard: {
      image: "https://upload.wikimedia.org/wikipedia/commons/e/ec/RedDot.svg",
      scale: 0.8,
      verticalOrigin: VerticalOrigin.BOTTOM,
      heightReference: HeightReference.NONE,
    },
    description: `📌 Zone ${currentZone.id}`
  });

  console.log(`📍 Pin placed at [${lng}, ${lat}] for Zone ${currentZone.id}`);
  updateCounter();
}

function finishPolygon() {
  if (currentZone.points.length < 3) {
    alert("Need at least 3 points to form a polygon.");
    return;
  }

  const color = colors[currentColorIndex % colors.length];
  currentColorIndex++;

  const polygonEntity = viewer.entities.add({
    polygon: {
      hierarchy: new PolygonHierarchy(currentZone.points),
      material: color.withAlpha(0.4),
      outline: true,
      outlineColor: Color.BLACK
    }
  });

  zones.push({
    id: `Zone-${currentZone.id}`,
    coordinates: currentZone.points.map(pos => {
      const carto = Cartographic.fromCartesian(pos);
      return [CesiumMath.toDegrees(carto.longitude), CesiumMath.toDegrees(carto.latitude)];
    }),
    pin: currentZone.pin,
    color: color.toCssColorString()
  });

  // Reset current zone
  currentZone.id++;
  currentZone.points = [];
  currentZone.pin = null;
  currentZone.pinEntity = null;
  currentZone.polylineEntity = null;
  updateCounter();
}

function exportGeoJSON() {
  if (zones.length === 0) return alert("❌ No zones to export!");

  const features = zones.map(zone => ({
    type: "Feature",
    properties: {
      zoneId: zone.id,
      pin: zone.pin,
      color: zone.color
    },
    geometry: {
      type: "Polygon",
      coordinates: [[...zone.coordinates, zone.coordinates[0]]]
    }
  }));

  const geojson = {
    type: "FeatureCollection",
    features
  };

  const blob = new Blob([JSON.stringify(geojson, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "multi-zone.geojson";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  console.log("✅ Exported", zones.length, "zones.");
}

function clearAll() {
  currentZone.points = [];
  currentZone.pin = null;
  zones = [];
  viewer.entities.removeAll();
  currentColorIndex = 0;
  currentZone.id = 1;
  placingPin = false;
  updateCounter();
  console.log("🧹 Cleared all zones.");
}

// === NEW: Import Existing GeoJSON ===
document.getElementById("importBtn").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  const geojson = JSON.parse(text);

  geojson.features.forEach((feature, i) => {
    const name = feature.properties?.zoneId || `Zone-${i + 1}`;
    const coords = feature.geometry.coordinates[0].slice(0, -1);
    const pinCoords = feature.properties?.pin;
    const colorStr = feature.properties?.color || colors[currentColorIndex % colors.length].toCssColorString();

    const cartesianPoints = coords.map(([lon, lat]) =>
      Cartesian3.fromDegrees(lon, lat)
    );

    // Add polygon
    viewer.entities.add({
      polygon: {
        hierarchy: new PolygonHierarchy(cartesianPoints),
        material: Color.fromCssColorString(colorStr).withAlpha(0.4),
        outline: true,
        outlineColor: Color.BLACK
      }
    });

    // Add pin
    if (pinCoords?.length === 2) {
      viewer.entities.add({
        position: Cartesian3.fromDegrees(pinCoords[0], pinCoords[1], 500),
        billboard: {
          image: "https://upload.wikimedia.org/wikipedia/commons/e/ec/RedDot.svg",
          scale: 0.8,
          verticalOrigin: VerticalOrigin.BOTTOM
        },
        description: `📌 Imported ${name}`
      });
    }

    zones.push({
      id: name,
      coordinates: coords,
      pin: pinCoords || null,
      color: colorStr
    });

    currentColorIndex++;
  });

  console.log("✅ Imported GeoJSON zones:", zones.length);
  updateCounter();
});

// === Buttons ===
document.getElementById("undoBtn").onclick = undoLastPoint;
document.getElementById("placePinBtn").onclick = () => {
  if (currentZone.points.length === 0) {
    alert("⚠️ You must draw a zone before placing a pin.");
    return;
  }
  placingPin = true;
  alert("🖱️ Click on map to place pin for current zone.");
};
document.getElementById("finishBtn").onclick = finishPolygon;
document.getElementById("exportBtn").onclick = exportGeoJSON;
document.getElementById("clearBtn").onclick = clearAll;

updateCounter();
