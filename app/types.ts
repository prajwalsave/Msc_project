import { Entity, Color } from "cesium";

export interface AQMetricConfig {
  label: string;
  color: Color;
  scale: number;
}

export interface AQDataEntry {
  no2?: number;
  pm25?: number;
  pm10?: number;
  o3?: number;
}

export type AQData = Record<string, AQDataEntry>;

export type TrafficDataEntry = Record<string, number>;
export type TrafficData = Record<string, TrafficDataEntry>;

export interface ZoneFeatureProperties {
  zoneId: string;
  pin?: [number, number];
  color?: string;
}

export interface ZoneFeature {
  type: string;
  properties: ZoneFeatureProperties;
  geometry: {
    type: string;
    coordinates: number[][][];
  };
}

export interface CorrelationResult {
  bestR: number;
  bestLag: number;
  n: number;
  all: Record<number, { r: number; n: number }>;
}

export interface Assumptions {
  shares: {
    car: number;
    lgv: number;
    hgv: number;
    bus: number;
  };
  ef: {
    car: number;
    lgv: number;
    hgv: number;
    bus: number;
  };
  dz: Record<string, number>;
}

export type AppMode = "aqi" | "traffic" | "compare";

export interface ZoneState {
  polygon: Entity;
  metricPolygons: Record<string, Entity>;
  trafficPolygon: Entity;
  overlay: HTMLElement;
  isVisible: boolean;
  latestAQ: { ts: string; values: AQDataEntry } | null;
  latestTraffic: { ts: string; count: number } | null;
  latestEmissions: { ts: string; kg: number } | null;
  coordsRing: [number, number][];
  sensors: Entity[];
  aqMap?: AQData;
}

export type ZonesMap = Record<string, ZoneState>;
