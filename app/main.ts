// ===================== main.ts =====================
(window as any).CESIUM_BASE_URL = '/cesium';

import {
  Viewer, Color, Cartesian3, Cartesian2, VerticalOrigin, HeightReference,
  ScreenSpaceEventHandler, ScreenSpaceEventType, Entity
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { init3dGoogleViewer } from "./cesium-init";
import {
  AQMetricConfig, AQData, TrafficData, ZoneFeature, CorrelationResult,
  Assumptions, ZoneState, ZonesMap, AppMode, AQDataEntry
} from "./types";

/* ===================== CONFIG ===================== */

const ZONE_NAMES: string[] = ["G1"]; // focus on G1 only

const AQ_METRICS: Record<string, AQMetricConfig> = {
  no2:  { label: "NO₂",   color: Color.fromCssColorString("#ffd54f").withAlpha(0.55), scale: 10 },
  pm25: { label: "PM2.5", color: Color.fromCssColorString("#ef5350").withAlpha(0.55), scale: 12 },
  pm10: { label: "PM10",  color: Color.fromCssColorString("#42a5f5").withAlpha(0.55), scale: 8  },
  o3:   { label: "O₃",    color: Color.fromCssColorString("#66bb6a").withAlpha(0.55), scale: 9  }
};
const BASE_HEIGHT: number = 1000;

// Traffic visuals
const TRAFFIC_BASE_HEIGHT: number = 950;
const TRAFFIC_MAX_DELTA: number   = 700;
const TRAFFIC_ALPHA: number       = 0.45;
const TRAFFIC_COLOR: Color       = Color.fromCssColorString("#ff9800").withAlpha(TRAFFIC_ALPHA);

// Footprint gaps (meters)
const AQ_GAP_M: number      = 120;
const TRAFFIC_GAP_M: number = 440;

/* ===== Overlay layout (masonry) ===== */
const OVERLAY_WIDTH: number       = 320;
const OVERLAY_GAP: number         = 12;
const OVERLAY_BASE_BOTTOM: number = 86;

/* ===== Assumptions ===== */
const DEFAULT_ASSUMPTIONS: Assumptions = {
  shares: { car: 0.78, lgv: 0.14, hgv: 0.05, bus: 0.03 },
  ef:     { car: 0.18, lgv: 0.25, hgv: 0.85, bus: 0.82 }, // kg CO2/km
  dz:     { G1: 0.5, G2: 0.5, G3: 0.5 }                   // km/veh
};
let assumptions: Assumptions = loadAssumptions();

/* ===== Correlation config ===== */
const MAX_LAG_H: number = 24;   // ±24 hours
const MIN_CORR_N: number = 12;  // minimum overlapping points to accept r

/* ===================== STATE ===================== */

const zones: ZonesMap = {};             // per-zone objects (augmented below with coordsRing + sensors)
let aqiTimeline: string[] = [];         // AQ timestamps (union)
let trafficTimeline: string[] = [];     // traffic timestamps
let compareTimeline: string[] = [];     // intersection timestamps
let trafficData: TrafficData = {};         // { ts: { G1: count } }
let trafficMax: number = 1;
let mode: AppMode = "compare";         // "aqi" | "traffic" | "compare"

// corrCache[zoneId][metric] = {bestR, bestLag, n, all:{lag->r}}
const corrCache: Record<string, Record<string, CorrelationResult>> = {};

// master toggle for all sensor markers
let sensorsEnabled: boolean = true;

/* ===================== UTILS ===================== */

function metersToDegrees(latDeg: number, metersEast: number, metersNorth: number): { dLon: number, dLat: number } {
  const latRad = (latDeg * Math.PI) / 180;
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos(latRad);
  return { dLon: metersEast / metersPerDegLon, dLat: metersNorth / metersPerDegLat };
}
function offsetPolygonMeters(coords: [number, number][], metersEast: number, metersNorth: number): [number, number][] {
  const latAvg = coords.reduce((s, [,lat]) => s + lat, 0) / coords.length;
  const { dLon, dLat } = metersToDegrees(latAvg, metersEast, metersNorth);
  const out: [number, number][] = coords.map(([lon, lat]) => [lon + dLon, lat + dLat]);
  const a = coords[0], b = coords[coords.length - 1];
  if (a[0] === b[0] && a[1] === b[1]) out.push(out[0]);
  return out;
}
const fmt  = (ts: string): string => ts;
const fmt1 = (x: any): string => (x==null || isNaN(x) ? "—" : Number(x).toFixed(2));
function setGroupVisible(id: string, visible: boolean): void {
  const el = document.getElementById(id);
  if (!el) { console.warn(`⚠️ Missing element #${id}`); return; }
  el.classList.toggle("show", visible);
}

function bucketToHour(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00:00`;
}

/* ===== Emissions helpers ===== */
function effectiveEF(): number {
  const s = assumptions.shares;
  const sum = Math.max(1e-6, (s.car||0)+(s.lgv||0)+(s.hgv||0)+(s.bus||0));
  const sn = { car:(s.car||0)/sum, lgv:(s.lgv||0)/sum, hgv:(s.hgv||0)/sum, bus:(s.bus||0)/sum };
  const ef = assumptions.ef;
  return sn.car*(ef.car||0) + sn.lgv*(ef.lgv||0) + sn.hgv*(ef.hgv||0) + sn.bus*(ef.bus||0);
}
function estimateCO2kg(zoneId: string, vehicleCount: number | null): number | null {
  if (vehicleCount==null || isNaN(vehicleCount)) return null;
  const km = assumptions.dz[zoneId] ?? 0.5;
  return vehicleCount * effectiveEF() * km;
}

/* ======== Sensors: CSV parsing + point-in-polygon ======== */

// tiny CSV parser (handles quoted fields)
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map(h => h.trim());
  const out: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row: string[] = [];
    let s = "", q = false, L = lines[i];
    for (let j = 0; j < L.length; j++) {
      const c = L[j];
      if (c === '"') {
        if (q && L[j+1] === '"') { s += '"'; j++; } else q = !q;
      } else if (c === ',' && !q) { row.push(s); s = ""; }
      else s += c;
    }
    row.push(s);
    const obj: Record<string, string> = {};
    headers.forEach((h,k)=> obj[h] = (row[k] ?? "").trim());
    out.push(obj);
  }
  return out;
}

// pick column by common aliases
function pickHeader(headers: string[], candidates: string[]): string | null {
  const lower = headers.map(h => h.toLowerCase());
  for (const c of candidates) {
    const i = lower.indexOf(c.toLowerCase());
    if (i !== -1) return headers[i];
  }
  return null;
}

// point-in-polygon (lon/lat)
function pointInPolygon(lon: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    const intersect = ((yi > lat) !== (yj > lat)) &&
                      (lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/* ===================== LOADERS ===================== */

async function loadAllAQData(): Promise<void> {
  const keyset = new Set<string>();
  for (const name of ZONE_NAMES) {
    if (!zones[name]) zones[name] = {} as ZoneState;
    if (!zones[name].aqMap) zones[name].aqMap = {};

    try {
      const liveRes = await fetch("/api/aq/latest");
      if (!liveRes.ok) throw new Error(`Live AQ non-200: ${liveRes.status}`);
      const liveData = await liveRes.json();
      
      for (const [ts, values] of Object.entries(liveData)) {
        const hourTs = bucketToHour(ts);
        zones[name].aqMap![hourTs] = values as any;
      }
      console.log(`✅ Live AQ merged for ${name}`);
    } catch (err) {
      console.warn(`⚠️ Live API failed for ${name}, falling back to static JSON:`, err);
      try {
        const res = await fetch(`/data/${name.toLowerCase()}_air_quality_animated.json`);
        const json = await res.json();
        zones[name].aqMap = { ...zones[name].aqMap, ...json };
        console.log(`✅ AQ ${name} static loaded`);
      } catch (staticErr) {
        console.error(`❌ AQ static load failed for ${name}:`, staticErr);
      }
    }
    
    Object.keys(zones[name].aqMap!).forEach(k => keyset.add(k));
  }
  aqiTimeline = Array.from(keyset).sort();
  const slider = document.getElementById("aqi-slider") as HTMLInputElement;
  if (slider) slider.max = Math.max(0, aqiTimeline.length - 1).toString();
  else console.warn("⚠️ Missing #aqi-slider");
  const lab = document.getElementById("aqi-time-label");
  if (lab) lab.textContent = aqiTimeline[0] ? fmt(aqiTimeline[0]) : "—";
}

async function loadTrafficData(): Promise<void> {
  try {
    const res = await fetch("/data/zone_traffic_aggregated.json");
    trafficData = await res.json();
    trafficTimeline = Object.keys(trafficData).sort();
    let mx = 1;
    for (const ts in trafficData) {
      for (const z in trafficData[ts]) {
        const v = trafficData[ts][z];
        if (typeof v === "number" && v > mx) mx = v;
      }
    }
    trafficMax = mx;
    const tSlider = document.getElementById("traffic-slider") as HTMLInputElement;
    if (tSlider) tSlider.max = Math.max(0, trafficTimeline.length - 1).toString();
    else console.warn("⚠️ Missing #traffic-slider");
    const lab = document.getElementById("traffic-time-label");
    if (lab) lab.textContent = trafficTimeline[0] ? fmt(trafficTimeline[0]) : "—";
    console.log(`✅ Traffic loaded (${trafficTimeline.length} timestamps). max=${trafficMax}`);
  } catch (err) { console.error("❌ Traffic load failed:", err); }
}

async function loadZones(viewer: Viewer): Promise<void> {
  const geojson = await fetch("/data/multi-zone.geojson").then(r => r.json());

  for (const feature of geojson.features) {
    const zoneId = feature.properties?.zoneId;
    if (!zoneId || !ZONE_NAMES.includes(zoneId)) continue;

    const coords: [number, number][] = feature.geometry.coordinates[0];
    const flat = coords.flat();
    const baseColor = Color.fromCssColorString(feature.properties?.color || "rgb(0,0,255)").withAlpha(0.22);

    const polygon = viewer.entities.add({
      id: `zone-${zoneId}`,
      polygon: {
        hierarchy: Cartesian3.fromDegreesArray(flat) as any,
        material: baseColor,
        outline: true,
        outlineColor: Color.fromCssColorString("#808080"),
        show: false
      }
    });

    // Per-metric offsets (meters)
    const metricOffsetsM: Record<string, { east: number, north: number }> = {
      no2:  { east: -AQ_GAP_M, north: 0 },
      pm25: { east: 0,         north: -AQ_GAP_M },
      pm10: { east: AQ_GAP_M,  north: 0 },
      o3:   { east: 0,         north: AQ_GAP_M }
    };
    const metricPolygons: Record<string, Entity> = {};
    for (const [key, cfg] of Object.entries(AQ_METRICS)) {
      const { east, north } = metricOffsetsM[key] || { east: 0, north: 0 };
      const shifted = offsetPolygonMeters(coords, east, north).flat();
      metricPolygons[key] = viewer.entities.add({
        id: `zone-${zoneId}-${key}`,
        polygon: {
          hierarchy: Cartesian3.fromDegreesArray(shifted) as any,
          material: cfg.color,
          outline: false,
          height: BASE_HEIGHT,
          extrudedHeight: BASE_HEIGHT,
          show: false
        }
      });
    }

    // Traffic extruded polygon (meters NE)
    const tShifted = offsetPolygonMeters(coords, TRAFFIC_GAP_M, TRAFFIC_GAP_M).flat();
    const trafficPolygon = viewer.entities.add({
      id: `traffic-${zoneId}`,
      polygon: {
        hierarchy: Cartesian3.fromDegreesArray(tShifted) as any,
        material: TRAFFIC_COLOR,
        outline: true,
        outlineColor: Color.fromCssColorString("#ffffff").withAlpha(0.6),
        height: TRAFFIC_BASE_HEIGHT,
        extrudedHeight: TRAFFIC_BASE_HEIGHT,
        show: false
      }
    });

    // Pin
    let lon = -4.25, lat = 55.86;
    if (Array.isArray(feature.properties?.pin)) {
      lon = feature.properties.pin[0];
      lat = feature.properties.pin[1];
    } else {
      const [lonSum, latSum] = coords.reduce(([a,b],[lo,la]) => [a+lo, b+la], [0,0]);
      lon = lonSum / coords.length; lat = latSum / coords.length;
    }
    viewer.entities.add({
      id: `pin-${zoneId}`,
      name: `Pin-${zoneId}`,
      position: Cartesian3.fromDegrees(lon, lat, 500),
      billboard: {
        image: "https://upload.wikimedia.org/wikipedia/commons/e/ec/RedDot.svg",
        scale: 1.2,
        verticalOrigin: VerticalOrigin.BOTTOM,
        heightReference: HeightReference.NONE
      }
    });

    // Overlay
    const overlay = document.createElement("div");
    overlay.className = "aq-overlay";
    overlay.style.position = "absolute";
    overlay.style.width = `${OVERLAY_WIDTH}px`;
    overlay.style.display = "none";
    overlay.id = `overlay-${zoneId}`;
    document.body.appendChild(overlay);

    zones[zoneId] = {
      ...zones[zoneId],
      polygon, metricPolygons, trafficPolygon, overlay,
      isVisible: false,
      latestAQ: null, latestTraffic: null, latestEmissions: null,
      coordsRing: coords,
      sensors: []
    };
  }
}

/* ===================== Sensors loader ===================== */

async function loadSensors(viewer: Viewer): Promise<void> {
  try {
    const resp = await fetch("/data/locations.csv");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    const rows = parseCSV(text);
    if (!rows.length) { console.warn("locations.csv empty."); return; }

    const headers = Object.keys(rows[0]);
    const LAT = pickHeader(headers, ["lat","latitude","Lat","Latitude"]);
    const LON = pickHeader(headers, ["lon","lng","long","longitude","Lon","Longitude"]);
    const ZON = pickHeader(headers, ["zone","zoneId","zone_id","Zone"]);
    const NAM = pickHeader(headers, ["name","site","station","id","Name"]);

    if (!LAT || !LON) { console.warn("No lat/lon columns found in locations.csv"); return; }

    let placed = 0, polyAssigned = 0, skipped = 0;

    for (const r of rows) {
      const lat = parseFloat(r[LAT]), lon = parseFloat(r[LON]);
      if (!isFinite(lat) || !isFinite(lon)) { skipped++; continue; }

      let zoneId = r[ZON as string] || "";
      if (!zoneId || !ZONE_NAMES.includes(zoneId)) {
        for (const zId of ZONE_NAMES) {
          const ring = zones[zId]?.coordsRing;
          if (ring && pointInPolygon(lon, lat, ring)) { zoneId = zId; polyAssigned++; break; }
        }
      }
      if (!ZONE_NAMES.includes(zoneId)) { skipped++; continue; }

      const entity = viewer.entities.add({
        position: Cartesian3.fromDegrees(lon, lat),
        point: {
          pixelSize: 12,
          color: Color.CYAN.withAlpha(0.9),
          outlineColor: Color.WHITE,
          outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        label: {
          text: (NAM ? (r[NAM] || "Sensor") : "Sensor"),
          font: "13px sans-serif",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          showBackground: true,
          backgroundColor: Color.fromCssColorString("#000").withAlpha(0.45),
          pixelOffset: new Cartesian2(0, -20),
          verticalOrigin: VerticalOrigin.TOP,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          show: false
        },
        show: false
      });

      zones[zoneId].sensors.push(entity);
      placed++;
    }

    console.log(`📍 Sensors loaded: placed=${placed}, polygon-assigned=${polyAssigned}, skipped=${skipped}`);

    // Hover labels (only when sensors are enabled)
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: any) => {
      const picked = sensorsEnabled ? viewer.scene.pick(movement.endPosition) : null;
      for (const z of Object.values(zones)) {
        for (const s of z.sensors) {
          if (s.label) s.label.show = (!!(picked && picked.id === s)) as any;
        }
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);

  } catch (err) {
    console.warn("Failed to load /data/locations.csv:", err);
  }
}

function setZoneSensorsVisible(zoneId: string, visible: boolean): void {
  const list = zones[zoneId]?.sensors || [];
  for (const e of list) e.show = visible && sensorsEnabled;
}

/* ===================== OVERLAY LAYOUT (masonry) ===================== */

function layoutOverlays(): void {
  const panelOpen = document.getElementById("assumptions-panel")?.classList.contains("show");
  const baseLeft  = panelOpen ? 370 : 20;
  const availW    = Math.max(220, window.innerWidth - baseLeft - 20);
  const W         = OVERLAY_WIDTH, G = OVERLAY_GAP;

  let cols = Math.max(1, Math.floor((availW + G) / (W + G)));
  cols = Math.min(cols, 4);

  const visible = ZONE_NAMES.filter(z => zones[z]?.isVisible);
  ZONE_NAMES.forEach(z => { if (!visible.includes(z) && zones[z]) zones[z].overlay.style.display = "none"; });
  if (visible.length === 0) return;

  const colHeights = new Array(cols).fill(0);

  visible.forEach(zId => {
    const el = zones[zId].overlay;
    el.style.display = "block";
    el.style.left = "-10000px"; el.style.bottom = "0px";
    const h = (el.offsetHeight || 140);

    let c = 0; for (let k = 1; k < cols; k++) if (colHeights[k] < colHeights[c]) c = k;
    const left   = baseLeft + c * (W + G);
    const bottom = OVERLAY_BASE_BOTTOM + colHeights[c];

    el.style.left = `${left}px`;
    el.style.bottom = `${bottom}px`;
    colHeights[c] += h + G;
  });
}

/* ===================== CORRELATION (±24 h) ===================== */

// Pearson r
function pearsonR(x: number[], y: number[]): { r: number, n: number } {
  const n = x.length;
  if (n < 2) return { r: NaN, n };
  let sx=0, sy=0, sxx=0, syy=0, sxy=0;
  for (let i=0;i<n;i++){
    const xi = x[i], yi = y[i];
    sx += xi; sy += yi;
    sxx += xi*xi; syy += yi*yi; sxy += xi*yi;
  }
  const cov = sxy - (sx*sy)/n;
  const vx  = sxx - (sx*sx)/n;
  const vy  = syy - (sy*sy)/n;
  const denom = Math.sqrt(vx*vy);
  if (denom <= 0) return { r: NaN, n };
  return { r: cov/denom, n };
}

// Build aligned arrays for a given zone & metric over compareTimeline
function buildAligned(zoneId: string, metric: string, lagH: number): { A: number[], T: number[] } {
  const A: number[] = []; const T: number[] = [];
  const m = compareTimeline.length;
  if (m === 0) return { A, T };

  const start = Math.max(0, -lagH);
  const end   = Math.min(m, m - Math.max(0, lagH));
  for (let i = start; i < end; i++) {
    const idxAQ = i + Math.max(0, lagH);
    const idxTR = i + Math.max(0, -lagH);
    const tsAQ = compareTimeline[idxAQ];
    const tsTR = compareTimeline[idxTR];
    const aqVal = (zones[zoneId]?.aqMap?.[tsAQ] as any)?.[metric];
    const trVal = trafficData?.[tsTR]?.[zoneId];
    if (isFinite(aqVal) && isFinite(trVal)) { A.push(aqVal); T.push(trVal); }
  }
  return { A, T };
}

function computeCorrelationZoneMetric(zoneId: string, metric: string, maxLag: number = MAX_LAG_H): CorrelationResult {
  const result: CorrelationResult = { bestR: NaN, bestLag: 0, n: 0, all: {} };
  let bestAbs = -1;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const { A, T } = buildAligned(zoneId, metric, lag);
    if (A.length >= MIN_CORR_N) {
      const { r, n } = pearsonR(A, T);
      result.all[lag] = { r, n };
      if (isFinite(r) && Math.abs(r) > bestAbs) {
        bestAbs = Math.abs(r);
        result.bestR = r; result.bestLag = lag; result.n = n;
      }
    } else {
      result.all[lag] = { r: NaN, n: A.length };
    }
  }
  return result;
}

function computeAllCorrelations(): void {
  for (const z of ZONE_NAMES) {
    corrCache[z] = {};
    for (const metric of Object.keys(AQ_METRICS)) {
      corrCache[z][metric] = computeCorrelationZoneMetric(z, metric, MAX_LAG_H);
    }
  }
  console.group("ℹ️ Correlation summary (±24h), compare window only");
  for (const z of ZONE_NAMES) {
    for (const m of Object.keys(AQ_METRICS)) {
      const c = corrCache[z][m];
      const leadlag = c.bestLag < 0 ? "AQ leads" : (c.bestLag > 0 ? "AQ lags" : "simult.");
      console.log(`${z} – ${AQ_METRICS[m].label}: r=${fmt1(c.bestR)}, lag=${c.bestLag}h (${leadlag}), n=${c.n}`);
    }
  }
  console.groupEnd();
}

/* ===================== OVERLAY CONTENT ===================== */

function renderOverlay(zoneId: string): void {
  const zone = zones[zoneId];
  if (!zone) return;
  const aq = zone.latestAQ;
  const tr = zone.latestTraffic;
  const em = zone.latestEmissions;

  let html = `<strong>📍 ${zoneId}</strong>`;
  if (mode !== "traffic") {
    if (aq) {
      html += `<br><b>Air Quality (${aq.ts})</b>`;
      for (const [k,cfg] of Object.entries(AQ_METRICS)) {
        const val = (aq.values as any)?.[k];
        if (val != null) html += `<br>${cfg.label}: ${val} µg/m³`;
      }
    } else html += `<br><b>Air Quality:</b> —`;
  }
  if (mode !== "aqi") {
    if (tr) {
      html += `<hr style="border-color:rgba(255,255,255,0.25)">`;
      html += `<b>Traffic (${tr.ts})</b><br>Vehicles/hour: ${tr.count}`;
      if (em && em.kg != null) html += `<br>Est. CO₂: ${fmt1(em.kg)} kg/h`;
    } else html += `<hr style="border-color:rgba(255,255,255,0.25)"><b>Traffic:</b> —`;
  }

  if (mode === "compare") {
    const cc = corrCache[zoneId] || {};
    const lines = [];
    for (const key of Object.keys(AQ_METRICS)) {
      const c = cc[key];
      if (c && isFinite(c.bestR) && c.n >= MIN_CORR_N) {
        const leadlag = c.bestLag < 0 ? "AQ leads" : (c.bestLag > 0 ? "AQ lags" : "simult.");
        lines.push(`${AQ_METRICS[key].label}: r=${fmt1(c.bestR)} @ ${c.bestLag} h (${leadlag})`);
      }
    }
    if (lines.length) {
      html += `<hr style="border-color:rgba(255,255,255,0.25)">`;
      html += `<b>Correlation (±24h) vs Traffic</b><br>${lines.join("<br>")}`;
    }
  }

  zone.overlay.innerHTML = html;
}

/* ===================== UPDATERS ===================== */

function updateAQAtTimestamp(ts: string): void {
  for (const zoneId of ZONE_NAMES) {
    const zone = zones[zoneId];
    if (!zone?.isVisible) continue;
    const entry = zone.aqMap?.[ts];
    for (const [key,cfg] of Object.entries(AQ_METRICS)) {
      const poly = zone.metricPolygons[key];
      if (!poly || !poly.polygon) continue;
      const val = (entry as any)?.[key];
      if (val != null && !isNaN(val)) {
        const h = BASE_HEIGHT + val * cfg.scale;
        (poly.polygon.extrudedHeight as any) = h;
        (poly.polygon.show as any) = (mode !== "traffic");
      } else {
        (poly.polygon.show as any) = false;
      }
    }
    if (entry) zone.latestAQ = { ts, values: entry };
    renderOverlay(zoneId);
  }
  layoutOverlays();
}

function updateTrafficAtTimestamp(ts: string): void {
  const values = trafficData[ts] || {};
  for (const zoneId of ZONE_NAMES) {
    const zone = zones[zoneId];
    if (!zone?.isVisible) continue;
    const count = values?.[zoneId];
    if (typeof count === "number") {
      const norm = Math.min(1, count / trafficMax);
      const h = TRAFFIC_BASE_HEIGHT + norm * TRAFFIC_MAX_DELTA;
      if(zone.trafficPolygon.polygon) {
        (zone.trafficPolygon.polygon.extrudedHeight as any) = h;
        (zone.trafficPolygon.polygon.show as any) = (mode !== "aqi");
      }
      zone.latestTraffic = { ts, count };
      const kg = estimateCO2kg(zoneId, count);
      zone.latestEmissions = kg==null ? null : { ts, kg };
    } else {
      if(zone.trafficPolygon.polygon) (zone.trafficPolygon.polygon.show as any) = false;
      zone.latestTraffic = null;
      zone.latestEmissions = null;
    }
    renderOverlay(zoneId);
  }
  layoutOverlays();
}

/* ===================== MODES ===================== */

function setMode(newMode: AppMode): void {
  mode = newMode;
  console.log(`🟦 setMode('${newMode}')`);
  const showAqi      = (mode === "aqi");
  const showTraffic  = (mode === "traffic");
  const showCompare  = (mode === "compare");

  setGroupVisible("groupAqi", showAqi);
  setGroupVisible("groupTraffic", showTraffic);
  setGroupVisible("groupCompare", showCompare);

  for (const zId of ZONE_NAMES) {
    const z = zones[zId];
    if (!z) continue;
    const aqVisible = (mode !== "traffic") && z.isVisible;
    const trVisible = (mode !== "aqi")     && z.isVisible;
    for (const p of Object.values(z.metricPolygons || {})) if(p.polygon) (p.polygon.show as any) = aqVisible;
    if (z.trafficPolygon && z.trafficPolygon.polygon) (z.trafficPolygon.polygon.show as any) = trVisible;
    renderOverlay(zId);
  }
  layoutOverlays();

  // refresh current frame if any zone is visible
  if (Object.values(zones).some(z=>z.isVisible)) triggerRefreshForCurrentMode();
}

function triggerRefreshForCurrentMode(): void {
  if (mode === "aqi" && aqiTimeline.length) {
    const el = document.getElementById("aqi-slider") as HTMLInputElement;
    const idx = parseInt(el?.value || "0") || 0;
    const ts = aqiTimeline[idx];
    console.log("↻ refresh AQ @", ts);
    if (ts) updateAQAtTimestamp(ts);
  } else if (mode === "traffic" && trafficTimeline.length) {
    const el = document.getElementById("traffic-slider") as HTMLInputElement;
    const idx = parseInt(el?.value || "0") || 0;
    const ts = trafficTimeline[idx];
    console.log("↻ refresh Traffic @", ts);
    if (ts) updateTrafficAtTimestamp(ts);
  } else if (mode === "compare" && compareTimeline.length) {
    const el = document.getElementById("compare-slider") as HTMLInputElement;
    const idx = parseInt(el?.value || "0") || 0;
    const ts = compareTimeline[idx];
    console.log("↻ refresh Compare @", ts);
    if (ts) { updateAQAtTimestamp(ts); updateTrafficAtTimestamp(ts); }
  } else {
    console.log("↻ refresh skipped (no data or no visible zones)");
  }
}

/* ===================== PIN TOGGLE ===================== */

function enablePinClick(viewer: Viewer): void {
  const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((click: any) => {
    const picked = viewer.scene.pick(click.position);
    if (!picked?.id) return;
    const zoneId = picked.id.id?.replace?.("pin-","");
    if (!ZONE_NAMES.includes(zoneId)) return;
    const z = zones[zoneId];
    if (!z) return;

    z.isVisible = !z.isVisible;
    if(z.polygon.polygon) (z.polygon.polygon.show as any) = z.isVisible;
    z.overlay.style.display = z.isVisible ? "block" : "none";
    setZoneSensorsVisible(zoneId, z.isVisible);

    console.log(`📌 Pin clicked -> ${zoneId} ${z.isVisible ? "OPEN" : "CLOSED"}`);

    if (z.isVisible) triggerRefreshForCurrentMode();
    else {
      for (const p of Object.values(z.metricPolygons || {})) if(p.polygon) (p.polygon.show as any) = false;
      if (z.trafficPolygon && z.trafficPolygon.polygon) (z.trafficPolygon.polygon.show as any) = false;
    }
    layoutOverlays();
  }, ScreenSpaceEventType.LEFT_CLICK);
}

/* ===================== ASSUMPTIONS UI ===================== */

function loadAssumptions(): Assumptions {
  try {
    const raw = localStorage.getItem("assumptions_v1");
    if (!raw) return structuredClone(DEFAULT_ASSUMPTIONS);
    const obj = JSON.parse(raw);
    return {
      shares: { ...DEFAULT_ASSUMPTIONS.shares, ...(obj.shares||{}) },
      ef:     { ...DEFAULT_ASSUMPTIONS.ef,     ...(obj.ef||{})     },
      dz:     { ...DEFAULT_ASSUMPTIONS.dz,     ...(obj.dz||{})     }
    };
  } catch { return structuredClone(DEFAULT_ASSUMPTIONS); }
}
function saveAssumptions(): void {
  localStorage.setItem("assumptions_v1", JSON.stringify(assumptions));
}
function pushAssumptionsToUI(): void {
  const id = (x: string)=>document.getElementById(x) as HTMLInputElement;
  if (!id("share-car")) { console.warn("⚠️ Assumptions inputs missing."); return; }

  id("share-car").value = assumptions.shares.car.toString();
  id("share-lgv").value = assumptions.shares.lgv.toString();
  id("share-hgv").value = assumptions.shares.hgv.toString();
  id("share-bus").value = assumptions.shares.bus.toString();

  id("ef-car").value = assumptions.ef.car.toString();
  id("ef-lgv").value = assumptions.ef.lgv.toString();
  id("ef-hgv").value = assumptions.ef.hgv.toString();
  id("ef-bus").value = assumptions.ef.bus.toString();

  ["dz-G1","dz-G2","dz-G3"].forEach(d => { const el=id(d); if(el) el.value = assumptions.dz[d.split("-")[1]].toString(); });

  const g12 = document.getElementById("dz-G12");
  if (g12) (g12.parentElement ? g12.parentElement : g12).style.display = "none";

  const lab = document.getElementById("label-eff-ef");
  if (lab) lab.textContent = effectiveEF().toFixed(3);
}
function readAssumptionsFromUI(): void {
  const num = (id: string, def=0) => {
    const el = document.getElementById(id) as HTMLInputElement;
    if (!el) return def;
    const v = parseFloat(el.value);
    return isFinite(v) && v>=0 ? v : def;
  };
  assumptions.shares.car = num("share-car", assumptions.shares.car);
  assumptions.shares.lgv = num("share-lgv", assumptions.shares.lgv);
  assumptions.shares.hgv = num("share-hgv", assumptions.shares.hgv);
  assumptions.shares.bus = num("share-bus", assumptions.shares.bus);

  assumptions.ef.car = num("ef-car", assumptions.ef.car);
  assumptions.ef.lgv = num("ef-lgv", assumptions.ef.lgv);
  assumptions.ef.hgv = num("ef-hgv", assumptions.ef.hgv);
  assumptions.ef.bus = num("ef-bus", assumptions.ef.bus);

  assumptions.dz.G1 = num("dz-G1", assumptions.dz.G1);
  assumptions.dz.G2 = num("dz-G2", assumptions.dz.G2);
  assumptions.dz.G3 = num("dz-G3", assumptions.dz.G3);

  const lab = document.getElementById("label-eff-ef");
  if (lab) lab.textContent = effectiveEF().toFixed(3);
}

/* ===================== INIT ===================== */

(async () => {
  const { viewer } = await init3dGoogleViewer();
  console.log("✅ Cesium viewer ready");

  await loadAllAQData();
  await loadTrafficData();
  await loadZones(viewer);
  await loadSensors(viewer);
  enablePinClick(viewer);

  // Build compare timeline (intersection)
  const tset = new Set(trafficTimeline);
  compareTimeline = aqiTimeline.filter(ts => tset.has(ts));
  const cmpSlider = document.getElementById("compare-slider") as HTMLInputElement;
  if (cmpSlider) cmpSlider.max = Math.max(0, compareTimeline.length - 1).toString();
  else console.warn("⚠️ Missing #compare-slider");
  const cLab = document.getElementById("compare-time-label");
  if (cLab) cLab.textContent = compareTimeline[0] ? fmt(compareTimeline[0]) : "—";

  // Correlations (if we have overlap)
  if (compareTimeline.length > 0) computeAllCorrelations();
  else console.warn("ℹ️ No compare window (AQ ∩ Traffic) — correlations skipped.");

  // Sliders
  const aqiSlider = document.getElementById("aqi-slider") as HTMLInputElement;
  const aqiLabel  = document.getElementById("aqi-time-label");
  if (aqiSlider) {
    aqiSlider.addEventListener("input", () => {
      const idx = parseInt(aqiSlider.value)||0;
      const ts = aqiTimeline[idx];
      if (aqiLabel) aqiLabel.textContent = ts ? fmt(ts) : "—";
      console.log("🎚️ AQ slider -> idx", idx, "ts", ts);
      if (ts) updateAQAtTimestamp(ts);
    });
  }

  const tSlider = document.getElementById("traffic-slider") as HTMLInputElement;
  const tLabel  = document.getElementById("traffic-time-label");
  if (tSlider) {
    tSlider.addEventListener("input", () => {
      const idx = parseInt(tSlider.value)||0;
      const ts = trafficTimeline[idx];
      if (tLabel) tLabel.textContent = ts ? fmt(ts) : "—";
      console.log("🎚️ Traffic slider -> idx", idx, "ts", ts);
      if (ts) updateTrafficAtTimestamp(ts);
    });
  }

  if (cmpSlider) {
    cmpSlider.addEventListener("input", () => {
      const idx = parseInt(cmpSlider.value)||0;
      const ts = compareTimeline[idx];
      if (cLab) cLab.textContent = ts ? fmt(ts) : "—";
      console.log("🎚️ Compare slider -> idx", idx, "ts", ts);
      if (ts) { updateAQAtTimestamp(ts); updateTrafficAtTimestamp(ts); }
    });
  }

  // Mode buttons (with logs)
  const btnAqi = document.getElementById("btnAqi");
  const btnTraffic = document.getElementById("btnTraffic");
  const btnCompare = document.getElementById("btnCompare");
  if (btnAqi) btnAqi.addEventListener("click", () => { console.log("🟢 btnAqi clicked"); setMode("aqi"); });
  else console.warn("⚠️ Missing #btnAqi");
  if (btnTraffic) btnTraffic.addEventListener("click", () => { console.log("🟢 btnTraffic clicked"); setMode("traffic"); });
  else console.warn("⚠️ Missing #btnTraffic");
  if (btnCompare) btnCompare.addEventListener("click", () => { console.log("🟢 btnCompare clicked"); setMode("compare"); });
  else console.warn("⚠️ Missing #btnCompare");

  // Assumptions panel + buttons (with logs)
  const panel = document.getElementById("assumptions-panel");
  const btnAssumptions = document.getElementById("btnAssumptions");
  if (btnAssumptions) {
    btnAssumptions.addEventListener("click", () => {
      console.log("🟢 btnAssumptions clicked");
      pushAssumptionsToUI();
      if (panel) panel.classList.toggle("show");
      layoutOverlays();
    });
  } else console.warn("⚠️ Missing #btnAssumptions");

  ["share-car","share-lgv","share-hgv","share-bus","ef-car","ef-lgv","ef-hgv","ef-bus"].forEach(id => {
    const el = document.getElementById(id);
    el && el.addEventListener("input", () => { readAssumptionsFromUI(); console.log("✏️ assumptions changed"); });
  });
  ["dz-G1","dz-G2","dz-G3"].forEach(id => {
    const el = document.getElementById(id);
    el && el.addEventListener("input", () => { readAssumptionsFromUI(); console.log("✏️ dz changed"); });
  });

  const btnApply = document.getElementById("assumptions-apply");
  const btnReset = document.getElementById("assumptions-reset");
  const btnClose = document.getElementById("assumptions-close");

  if (btnApply) btnApply.addEventListener("click", () => {
    console.log("🟢 assumptions-apply clicked");
    readAssumptionsFromUI();
    saveAssumptions();
    triggerRefreshForCurrentMode();
    layoutOverlays();
  });
  if (btnReset) btnReset.addEventListener("click", () => {
    console.log("🟢 assumptions-reset clicked");
    assumptions = structuredClone(DEFAULT_ASSUMPTIONS);
    pushAssumptionsToUI(); saveAssumptions();
    triggerRefreshForCurrentMode();
    layoutOverlays();
  });
  if (btnClose) btnClose.addEventListener("click", () => {
    console.log("🟢 assumptions-close clicked");
    if (panel) panel.classList.remove("show");
    layoutOverlays();
  });

  // Sensor toggle
  const btnToggle = document.getElementById("btnToggleSensors");
  if (btnToggle) {
    btnToggle.addEventListener("click", () => {
      sensorsEnabled = !sensorsEnabled;
      for (const zId of ZONE_NAMES) setZoneSensorsVisible(zId, zones[zId]?.isVisible);
      console.log("📍 Sensors " + (sensorsEnabled ? "enabled" : "hidden"));
    });
  }

  window.addEventListener("resize", layoutOverlays);

  // Default mode (no zone opened until pin click)
  setMode("compare");

  const aqPollInterval = setInterval(async () => {
    await loadAllAQData();
    const tset = new Set(trafficTimeline);
    compareTimeline = aqiTimeline.filter(ts => tset.has(ts));
    const cmpSlider = document.getElementById("compare-slider");
    if (cmpSlider) (cmpSlider as HTMLInputElement).max =
      String(Math.max(0, compareTimeline.length - 1));
    triggerRefreshForCurrentMode();
  }, 15 * 60 * 1000);
  void aqPollInterval;
})();
