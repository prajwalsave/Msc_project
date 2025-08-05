window.CESIUM_BASE_URL = '/cesium';

import {
  Viewer,
  Ion,
  Color,
  Cartesian3,
  VerticalOrigin,
  HeightReference,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType
} from "cesium";

import "cesium/Build/Cesium/Widgets/widgets.css";
import { init3dGoogleViewer } from "./app/cesium-init";

// === CONFIG ===
const AQ_METRICS = {
  no2:     { label: "NO₂",   color: Color.YELLOW.withAlpha(0.6), scale: 10 },
  pm25:    { label: "PM2.5", color: Color.RED.withAlpha(0.6),    scale: 12 },
  pm10:    { label: "PM10",  color: Color.BLUE.withAlpha(0.6),   scale: 8 },
  o3:      { label: "O₃",    color: Color.GREEN.withAlpha(0.6),  scale: 9 }
};

const BASE_HEIGHT = 1000;
const TRAFFIC_BASE_HEIGHT = 300;
const TRAFFIC_SCALE = 0.1;  // Adjusted for max 4197 => ~720m max height

const zones = {};
const ZONE_NAMES = ['G1', 'G2', 'G3', 'G12'];
let trafficData = {};

// === Load AQ Data ===
async function loadAllAQData() {
  for (let name of ZONE_NAMES) {
    try {
      const res = await fetch(`/data/${name.toLowerCase()}_air_quality_animated.json`);
      const json = await res.json();
      if (!zones[name]) zones[name] = {};
      zones[name].data = Object.entries(json);
      console.log(`✅ Loaded AQ for ${name}`);
    } catch (err) {
      console.error(`❌ Failed to load ${name} AQ:`, err);
    }
  }

  const slider = document.getElementById("aqi-slider");
  const firstZoneWithData = ZONE_NAMES.find(z => zones[z]?.data?.length > 0);
  if (firstZoneWithData) {
    slider.max = zones[firstZoneWithData].data.length - 1;
  }
}

// === Load Traffic Data ===
async function loadTrafficData() {
  try {
    const res = await fetch("/data/zone_traffic_aggregated.json");
    trafficData = await res.json();
    console.log("✅ Loaded Traffic Data");

    const slider = document.getElementById("traffic-slider");
    slider.max = Object.keys(trafficData).length - 1;
  } catch (err) {
    console.error("❌ Failed to load traffic data:", err);
  }
}

// === Load Zones ===
async function loadZones(viewer) {
  const geojson = await fetch("/data/multi-zone.geojson").then(r => r.json());

  geojson.features.forEach((feature) => {
    const zoneId = feature.properties?.zoneId;
    if (!zoneId) return;

    const coords = feature.geometry.coordinates[0];
    const flat = coords.flat();
    const color = Color.fromCssColorString(feature.properties?.color || "rgb(0,0,255)").withAlpha(0.5);

    const polygon = viewer.entities.add({
      id: `zone-${zoneId}`,
      polygon: {
        hierarchy: Cartesian3.fromDegreesArray(flat),
        material: color,
        outline: true,
        outlineColor: Color.BLACK,
        show: false
      }
    });

    const metricPolygons = {};
    for (const [key, config] of Object.entries(AQ_METRICS)) {
      metricPolygons[key] = viewer.entities.add({
        id: `zone-${zoneId}-${key}`,
        polygon: {
          hierarchy: Cartesian3.fromDegreesArray(flat),
          material: config.color,
          outline: false,
          show: false,
          height: BASE_HEIGHT,
          extrudedHeight: BASE_HEIGHT
        }
      });
    }

    const trafficPolygon = viewer.entities.add({
      id: `traffic-${zoneId}`,
      polygon: {
        hierarchy: Cartesian3.fromDegreesArray(flat),
        material: Color.ORANGE.withAlpha(0.6),
        outline: false,
        show: false,
        height: TRAFFIC_BASE_HEIGHT,
        extrudedHeight: TRAFFIC_BASE_HEIGHT
      }
    });

    const [lon, lat] = feature.properties?.pin || [
      coords.reduce((sum, [lon]) => sum + lon, 0) / coords.length,
      coords.reduce((sum, [, lat]) => sum + lat, 0) / coords.length
    ];

    const pin = viewer.entities.add({
      id: `pin-${zoneId}`,
      name: `Pin-${zoneId}`,
      position: Cartesian3.fromDegrees(lon, lat, 500),
      billboard: {
        image: "https://upload.wikimedia.org/wikipedia/commons/e/ec/RedDot.svg",
        scale: 1.5,
        verticalOrigin: VerticalOrigin.BOTTOM,
        heightReference: HeightReference.NONE
      }
    });

    const overlay = document.createElement("div");
    overlay.className = "aq-overlay";
    overlay.style.cssText = `
      display: none;
      position: absolute;
      bottom: 70px;
      left: ${20 + ZONE_NAMES.indexOf(zoneId) * 320}px;
      background: rgba(0,0,0,0.7);
      color: white;
      padding: 10px;
      font-family: sans-serif;
      border-radius: 6px;
      z-index: 1000;
      width: 280px;
    `;
    overlay.id = `overlay-${zoneId}`;
    document.body.appendChild(overlay);

    zones[zoneId] = {
      ...zones[zoneId],
      polygon,
      metricPolygons,
      trafficPolygon,
      pin,
      overlay,
      index: 0,
      isVisible: false
    };
  });
}

// === AQ Overlay + Height ===
function updateZoneOverlay(zoneId, index) {
  const zone = zones[zoneId];
  if (!zone?.data?.length) return;
  const [date, entry] = zone.data[Math.max(0, Math.min(index, zone.data.length - 1))];

  let html = `<strong>📍 ${zoneId} - Air Quality</strong><br><b>Date:</b> ${date}<br>`;
  for (const [key, config] of Object.entries(AQ_METRICS)) {
    const value = entry[key];
    const poly = zone.metricPolygons[key];
    if (poly && value != null && !isNaN(value)) {
      const height = BASE_HEIGHT + value * config.scale;
      poly.polygon.extrudedHeight = height;
      poly.polygon.show = true;
      html += `<b>${config.label}:</b> ${value} µg/m³<br>`;
    } else if (poly) {
      poly.polygon.show = false;
    }
  }
  zone.overlay.innerHTML = html;
}

// === Traffic Volume Update ===
function updateTraffic(index) {
  console.log("🚦 Updating traffic at index:", index);
  const allTimestamps = Object.keys(trafficData);
  const timestamp = allTimestamps[index];
  const values = trafficData[timestamp];

  for (const zoneId of ZONE_NAMES) {
    const count = values?.[zoneId];
    console.log(`Zone ${zoneId}:`, count);
    const zone = zones[zoneId];
    if (!zone || !zone.trafficPolygon) continue;

    if (count !== undefined) {
      const height = TRAFFIC_BASE_HEIGHT + count * TRAFFIC_SCALE;
      zone.trafficPolygon.polygon.extrudedHeight = height;
      zone.trafficPolygon.polygon.show = zone.isVisible;
    } else {
      zone.trafficPolygon.polygon.show = false;
    }
  }
}

// === Pin Click Toggle ===
function enablePinClick(viewer) {
  const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((click) => {
    const picked = viewer.scene.pick(click.position);
    if (!picked?.id) return;

    const zoneId = picked.id.id.replace("pin-", "");
    const zone = zones[zoneId];
    if (!zone) return;

    zone.isVisible = !zone.isVisible;
    zone.polygon.polygon.show = zone.isVisible;
    zone.overlay.style.display = zone.isVisible ? "block" : "none";

    for (const poly of Object.values(zone.metricPolygons)) {
      poly.polygon.show = zone.isVisible;
    }

    if (zone.trafficPolygon) {
      zone.trafficPolygon.polygon.show = zone.isVisible;
    }

    if (zone.isVisible) updateZoneOverlay(zoneId, zone.index);

    console.log(`${zone.isVisible ? "🔔 Opened" : "🔕 Closed"} zone ${zoneId}`);
  }, ScreenSpaceEventType.LEFT_CLICK);
}

// === INIT ===
(async () => {
  const { viewer } = await init3dGoogleViewer();
  console.log("✅ Cesium viewer ready");

  await loadAllAQData();
  await loadTrafficData();
  await loadZones(viewer);
  enablePinClick(viewer);

  document.getElementById("aqi-slider").addEventListener("input", (e) => {
    const index = parseInt(e.target.value);
    document.getElementById("aqi-time-label").textContent = `T${index}`;
    ZONE_NAMES.forEach(z => zones[z].isVisible && updateZoneOverlay(z, index));
  });

  document.getElementById("traffic-slider").addEventListener("input", (e) => {
    const index = parseInt(e.target.value);
    document.getElementById("traffic-time-label").textContent = `T${index}`;
    updateTraffic(index);
  });
})();
