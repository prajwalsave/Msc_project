# Architecture Overview

This document details the actual, current architecture of the Glasgow Carbon Map project based on an audit of the codebase. The project is currently a monolithic, purely client-side application built with Vanilla JavaScript/TypeScript, CesiumJS, and Vite. 

It handles data fetching, alignment, spatial computations (point-in-polygon), statistical correlation, and DOM updates dynamically at runtime within a single execution context (`main.js`).

## Project Structure

Below is the directory and file structure at the project root (`Main_project`), detailing the role of each file:

### Root Level Files

*   **`index.html`**
    *   **Role:** The single HTML entry point. It sets up the UI shell (toolbar, sliders, legend, assumptions panel), defines inline CSS for styling, and injects the `#cesiumContainer`. It imports `/main.js` as an ES module.
*   **`main.js`**
    *   **Role:** The monolithic core of the application. It orchestrates the data loading (`locations.csv`, JSON files), initializes UI event listeners, drives the Cesium entity generation (extruding polygons, spawning sensor pins), calculates the lag correlation using Pearson `r`, and handles manual DOM manipulations for the masonry layout overlays.
*   **`vite.config.js`**
    *   **Role:** Configuration for the Vite bundler. It uses `vite-plugin-cesium` to serve Cesium assets locally, exposes `/cesium` as a base URL, and establishes a proxy redirecting `/api` calls to `http://localhost:5055` (suggesting a companion backend API).
*   **`package.json` & `package-lock.json`**
    *   **Role:** Node.js project manifests. Defines dependencies (`cesium`, `axios`) and devDependencies (`vite`, `vite-plugin-cesium`, `vite-plugin-static-copy`).
*   **`tsconfig.json`**
    *   **Role:** TypeScript compiler configuration for checking `.ts` files inside the `app/` folder.
*   **`.env` & `.env_template`**
    *   **Role:** Environment variable files required to securely inject API keys (Cesium ION and Google Maps) into the Vite build pipeline via `import.meta.env`.
*   **`README`**
    *   **Role:** Setup instructions outlining `npm install` and the requirement to populate `.env`.
*   **`CS+ Projects Tracker 3009121s.pptx`**
    *   **Role:** A PowerPoint presentation tracking project progress.

### Directories

*   **`app/`**
    *   `cesium-init.ts`: The dedicated TypeScript module responsible for instantiating the Cesium Viewer, hiding unnecessary UI elements (like timelines), loading the Google Photorealistic 3D Tileset, and scripting the initial flyover animation to Glasgow.
    *   `vite-env.d.ts`: TypeScript declarations exposing Vite's `ImportMetaEnv` for typed environment variables.
*   **`public/data/`**
    *   Contains all static payloads queried at runtime (GeoJSON for zone shapes, CSV for sensor locations, and JSON files for time-series AQ/traffic metrics).
*   **`src/dev/`**
    *   Contains `draw.js` and `draw.html` (via Vite config), likely used as developer scratchpads or utilities to generate zone polygons.

## External Dependencies & Integrations

*   **CesiumJS (`cesium`)**: Used for the core 3D globe rendering engine.
*   **Google Photorealistic 3D Tiles**: Served via CesiumJS but authenticated via the Google Maps API key to render the highly detailed Glasgow cityscape.
*   **Axios**: Added as a dependency but minimally utilized (primarily seen in an alternative 2D map initializer within `cesium-init.ts`). Most native data fetching is done via the Fetch API.

## State Management & UI Flow

The current architecture does not use a reactive framework (like React or Vue). 

State is maintained via global variables defined at the top of `main.js`:
*   `zones {}`: A large master object mapping zone IDs (e.g., "G1") to their respective Cesium Polygon Entities, HTML overlay references, sensor arrays, and real-time data states.
*   `trafficTimeline []` & `aqiTimeline []`: Sorted arrays of timestamps used to drive the slider inputs.
*   `mode`: Tracks the current visual mode (`"aqi"`, `"traffic"`, or `"compare"`).

When a slider is scrubbed, the app queries the in-memory arrays, updates the `extrudedHeight` of specific Cesium entities, recalculates CO2 estimates via user-defined assumptions, and surgically replaces `.innerHTML` within floating HTML overlays.
