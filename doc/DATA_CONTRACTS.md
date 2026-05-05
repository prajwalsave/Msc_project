# Data Contracts & Payloads

The Glasgow Carbon Map project relies heavily on static files loaded at runtime from the `public/data/` directory. This document outlines the schemas and structures of the primary datasets driving the visualization.

## 1. GeoSpatial Boundaries
**File:** `multi-zone.geojson`
*   **Format:** Standard GeoJSON FeatureCollection.
*   **Role:** Defines the polygonal outlines of regions within Glasgow (e.g., G1, G2, G3, G12).
*   **Properties Contract:**
    *   `zoneId` (String): The critical key used to map data to the polygon (e.g., `"G1"`).
    *   `color` (String): Hex or rgb string defining the base color of the zone.
    *   `pin` (Array [lon, lat]): Optional override for the center pin location.

## 2. Air Quality Sensor Locations
**File:** `locations.csv`
*   **Format:** CSV (Comma Separated Values)
*   **Role:** Defines point-coordinates for various Air Quality sensors across the city.
*   **Headers Expected:**
    *   The parser looks for alias headers. It requires a latitude (`lat`, `latitude`), a longitude (`lon`, `lng`, `longitude`), a zone identifier (`zone`, `zoneId`), and a name (`name`, `site`, `id`).
    *   If a row lacks a `zone` identifier but the `lat`/`lon` falls inside one of the GeoJSON boundaries, the application uses a point-in-polygon algorithm to automatically associate it with a zone at runtime.

## 3. Hourly Air Quality Time-Series
**Files:** `[zone_id]_air_quality_animated.json` (e.g., `g1_air_quality_animated.json`)
*   **Format:** JSON Object mapped by ISO 8601 Timestamps.
*   **Role:** Provides hourly readings of specific pollutants.
*   **Structure:**
    ```json
    {
      "2023-10-01T00:00:00.000Z": {
        "no2": 15.4,
        "pm25": 8.1,
        "pm10": 12.0,
        "o3": 45.2
      },
      ...
    }
    ```
    *   Missing metrics or `null` values are dynamically hidden during visualization rendering.

## 4. Hourly Traffic Aggregation
**File:** `zone_traffic_aggregated.json`
*   **Format:** JSON Object mapped by ISO 8601 Timestamps.
*   **Role:** Provides total vehicular counts per zone.
*   **Structure:**
    ```json
    {
      "2023-10-01T00:00:00.000Z": {
        "G1": 1500,
        "G2": 2100,
        "G3": 1200
      },
      ...
    }
    ```
    *   Data requires alignment against the AQ timelines for accurate correlation calculation. The frontend dynamically builds an intersection `compareTimeline` to handle mismatches.

## 5. Granular Sensor Data (Reference)
**Files:** `openaq_location_[id]_measurments_[zone]_main.csv`
*   **Format:** CSV
*   **Role:** High-fidelity, localized readings from specific OpenAQ nodes. While present in the data folder, the current `main.js` architecture primarily targets the aggregate JSON files for the 3D extrusion visualizations.

## State Assumptions Schema
The application saves user assumptions in `localStorage` (`assumptions_v1`) to compute emissions.
*   **Contract:**
    ```json
    {
      "shares": { "car": 0.78, "lgv": 0.14, "hgv": 0.05, "bus": 0.03 },
      "ef":     { "car": 0.18, "lgv": 0.25, "hgv": 0.85, "bus": 0.82 },
      "dz":     { "G1": 0.5, "G2": 0.5, "G3": 0.5 }
    }
    ```
    *   `shares`: Fleet composition breakdown.
    *   `ef`: Emission Factors (kg CO2 / km).
    *   `dz`: Distance traveled inside the zone per vehicle type (km).
