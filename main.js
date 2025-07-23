// window.CESIUM_BASE_URL = '/cesium';

// import {
//   Viewer,
//   Ion,
//   Cesium3DTileset,
//   IonGeocodeProviderType,
//   GeoJsonDataSource,
//   Color,
//   Cartesian3,
//   VerticalOrigin,
//   HeightReference,
//   ScreenSpaceEventHandler,
//   ScreenSpaceEventType,
//   Cartographic,
//   LabelStyle
// } from "cesium";

// import "cesium/Build/Cesium/Widgets/widgets.css";
// import { init3dGoogleViewer } from "./app/cesium-init";

// // ========== VARIABLES ==========
// let airQualityData = [];
// let currentIndex = 0;
// let animationInterval = null;
// let sensorPin = null;
// const overlay = document.getElementById("aq-overlay");

// // ========== LOAD AIR QUALITY DATA ==========
// async function loadData() {
//   try {
//     const res = await fetch("/data/g1_air_quality_animated.json");
//     const json = await res.json();
//     airQualityData = Object.entries(json);
//     console.log("✅ Loaded", airQualityData.length, "AQ records");
//   } catch (e) {
//     console.error("❌ Failed to load AQ data:", e);
//   }
// }

// // ========== LOAD MULTI-ZONE GEOJSON ==========
// async function loadZones(viewer) {
//   try {
//     const dataSource = await GeoJsonDataSource.load("/data/multi-zone.geojson", {
//       clampToGround: true
//     });

//     viewer.dataSources.add(dataSource);
//     console.log("✅ Multi-zone GeoJSON loaded");

//     dataSource.entities.values.forEach(entity => {
//       const color = Color.fromRandom({ alpha: 0.4 });

//       entity.polygon.material = color;
//       entity.polygon.outline = true;
//       entity.polygon.outlineColor = Color.BLACK;

//       const zoneName = entity.properties?.name?.getValue?.();
//       if (zoneName) {
//         const center = Cesium.BoundingSphere.fromPoints(entity.polygon.hierarchy.getValue().positions).center;
//         const carto = Cartographic.fromCartesian(center);
//         const labelPos = Cartesian3.fromRadians(carto.longitude, carto.latitude, 100);

//         viewer.entities.add({
//           position: labelPos,
//           label: {
//             text: zoneName,
//             font: "14px sans-serif",
//             fillColor: Color.WHITE,
//             outlineColor: Color.BLACK,
//             outlineWidth: 2,
//             style: LabelStyle.FILL_AND_OUTLINE,
//             verticalOrigin: VerticalOrigin.CENTER
//           }
//         });
//       }
//     });
//   } catch (err) {
//     console.error("❌ Failed to load multi-zone GeoJSON:", err);
//   }
// }

// // ========== ADD 3D SENSOR PIN ==========
// function addSensorPin(viewer) {
//   const pinPos = Cartesian3.fromDegrees(-4.243631, 55.865782, 500);

//   const pin = viewer.entities.add({
//     id: "g1-sensor-pin",
//     name: "G1 AQ Sensor",
//     position: pinPos,
//     billboard: {
//       image: "https://upload.wikimedia.org/wikipedia/commons/e/ec/RedDot.svg",
//       scale: 1.8,
//       verticalOrigin: VerticalOrigin.BOTTOM,
//       heightReference: HeightReference.NONE
//     }
//   });

//   console.log("📍 G1 AQ sensor pin added at 500 m");
//   return pin;
// }

// // ========== MAKE PIN INTERACTIVE ==========
// function enablePinClick(viewer, pinEntity) {
//   const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

//   handler.setInputAction((event) => {
//     const picked = viewer.scene.pick(event.position);
//     if (picked && picked.id === pinEntity) {
//       console.log("🖱️ Pin clicked!");
//       animationInterval ? stopAnimation() : startAnimation();
//     }
//   }, ScreenSpaceEventType.LEFT_CLICK);
// }

// // ========== UPDATE HTML OVERLAY ==========
// function updateAQOverlay(date, data) {
//   overlay.innerHTML = `
//     <strong>📍 G1 - Air Quality</strong><br>
//     <b>Date:</b> ${date}<br>
//     <b>PM2.5:</b> ${data.pm25} µg/m³<br>
//     <b>NO₂:</b> ${data.no2} µg/m³<br>
//   `;
//   overlay.style.display = "block";
// }

// // ========== ANIMATION CONTROLS ==========
// function startAnimation() {
//   if (animationInterval || airQualityData.length === 0) return;
//   animationInterval = setInterval(() => {
//     if (currentIndex >= airQualityData.length) currentIndex = 0;
//     const [date, data] = airQualityData[currentIndex];
//     updateAQOverlay(date, data);
//     currentIndex++;
//   }, 1500);
// }

// function stopAnimation() {
//   if (animationInterval) {
//     clearInterval(animationInterval);
//     animationInterval = null;
//   }
// }

// // ========== BUTTON HANDLERS ==========
// document.getElementById("playBtn").onclick = () => {
//   console.log("▶️ Play clicked");
//   startAnimation();
// };
// document.getElementById("pauseBtn").onclick = () => {
//   console.log("⏸️ Pause clicked");
//   stopAnimation();
// };

// // ========== MAIN INIT ==========
// (async () => {
//   const { viewer } = await init3dGoogleViewer();
//   console.log("✅ Cesium viewer ready");

//   await loadData();
//   await loadZones(viewer);

//   sensorPin = addSensorPin(viewer);
//   enablePinClick(viewer, sensorPin);
// })();
window.CESIUM_BASE_URL = '/cesium';

import {
  Viewer,
  Ion,
  GeoJsonDataSource,
  Color,
  Cartesian3,
  VerticalOrigin,
  HeightReference,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartographic,
  LabelStyle,
  Math as CesiumMath
} from "cesium";

import "cesium/Build/Cesium/Widgets/widgets.css";
import { init3dGoogleViewer } from "./app/cesium-init";

// ========== GLOBALS ==========
let airQualityData = [];
let currentIndex = 0;
let animationInterval = null;
const overlay = document.getElementById("aq-overlay");
const zoneEntityMap = new Map();  // Map pin.id => polygon entity

// ========== LOAD AQ DATA ==========
async function loadData() {
  try {
    const res = await fetch("/data/g1_air_quality_animated.json");
    const json = await res.json();
    airQualityData = Object.entries(json);
    console.log("✅ Loaded", airQualityData.length, "AQ records");
  } catch (err) {
    console.error("❌ Failed to load AQ data:", err);
  }
}

// ========== LOAD ZONES & PINS ==========
async function loadZonesWithPins(viewer) {
  const geojson = await fetch("/data/multi-zone.geojson").then(r => r.json());

  geojson.features.forEach((feature, i) => {
    const name = feature.properties?.name || `Zone-${i + 1}`;
    const coords = feature.geometry.coordinates[0];
    const color = Color.fromRandom({ alpha: 0.4 });

    // Flatten coords for Cesium
    const flat = coords.flat();

    // Add polygon but hide initially
    const polygonEntity = viewer.entities.add({
      id: `zone-${name}`,
      polygon: {
        hierarchy: Cartesian3.fromDegreesArray(flat),
        material: color,
        outline: true,
        outlineColor: Color.BLACK,
        show: false
      }
    });

    // Center for floating pin
    const [lonSum, latSum] = coords.reduce(
      ([lx, ly], [lon, lat]) => [lx + lon, ly + lat],
      [0, 0]
    );
    const centerLon = lonSum / coords.length;
    const centerLat = latSum / coords.length;

    const pin = viewer.entities.add({
      id: `pin-${name}`,
      name: `Pin-${name}`,
      position: Cartesian3.fromDegrees(centerLon, centerLat, 500),
      billboard: {
        image: "https://upload.wikimedia.org/wikipedia/commons/e/ec/RedDot.svg",
        scale: 1.2,
        verticalOrigin: VerticalOrigin.BOTTOM,
        heightReference: HeightReference.NONE
      }
    });

    zoneEntityMap.set(`pin-${name}`, polygonEntity); // link pin to zone

    console.log(`📍 Added zone + pin for ${name}`);
  });
}

// ========== PIN INTERACTION ==========
function enablePinClicks(viewer) {
  const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((event) => {
    const picked = viewer.scene.pick(event.position);
    if (!picked || !picked.id) return;

    const id = picked.id.id;
    if (!zoneEntityMap.has(id)) return;

    // Show this zone
    const zoneEntity = zoneEntityMap.get(id);
    zoneEntity.polygon.show = true;

    console.log(`🖱️ Clicked ${id}, showing zone`);

    // Start animation for that zone
    startAnimation();
  }, ScreenSpaceEventType.LEFT_CLICK);
}

// ========== OVERLAY & ANIMATION ==========
function updateAQOverlay(date, data) {
  overlay.innerHTML = `
    <strong>📍 G1 - Air Quality</strong><br>
    <b>Date:</b> ${date}<br>
    <b>PM2.5:</b> ${data.pm25} µg/m³<br>
    <b>NO₂:</b> ${data.no2} µg/m³<br>
  `;
  overlay.style.display = "block";
}

function startAnimation() {
  if (animationInterval || airQualityData.length === 0) return;
  animationInterval = setInterval(() => {
    if (currentIndex >= airQualityData.length) currentIndex = 0;
    const [date, data] = airQualityData[currentIndex];
    updateAQOverlay(date, data);
    currentIndex++;
  }, 1500);
}

function stopAnimation() {
  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
  }
}

// ========== BUTTON HANDLERS ==========
document.getElementById("playBtn").onclick = () => {
  console.log("▶️ Play clicked");
  startAnimation();
};
document.getElementById("pauseBtn").onclick = () => {
  console.log("⏸️ Pause clicked");
  stopAnimation();
};

// ========== INIT ==========
(async () => {
  const { viewer } = await init3dGoogleViewer();
  console.log("✅ Cesium viewer ready");

  await loadData();
  await loadZonesWithPins(viewer);
  enablePinClicks(viewer);
})();

