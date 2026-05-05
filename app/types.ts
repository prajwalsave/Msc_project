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

export interface TrafficProfileEntry {
  [hour: string]: number;
}

export interface TrafficProfile {
  [day: string]: TrafficProfileEntry;
}

export interface TrafficCurrentResponse {
  timestamp: string;
  count: number;
  dayOfWeek: number;
  hourOfDay: number;
  isProfile: true;
}

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

export interface OpenAQParameter {
  id: number;
  name: string;
  units: string;
  displayName: string;
}

export interface OpenAQResult {
  period: {
    datetimeTo: { utc: string; local: string };
    datetimeFrom: { utc: string; local: string };
  };
  value: number;
  parameter: OpenAQParameter;
  coordinates: { latitude: number; longitude: number };
}

export interface OpenAQResponse {
  meta: {
    name: string;
    website: string;
    page: number;
    limit: number;
    found: number;
  };
  results: OpenAQResult[];
}
