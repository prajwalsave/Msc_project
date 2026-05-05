# PHASE_PLAN.md

Glasgow Carbon Map — Execution Roadmap
Generated after full audit of local project structure (May 2026).

This document is the authoritative phase plan. It supersedes the earlier draft
generated before the actual directory structure was confirmed. Do not proceed to
any phase without completing the phase before it.

---

## Phase 1b — Config and data fix (pre-TypeScript baseline)

### Objective
Eliminate the one remaining build blocker and document the data files correctly
so that Phase 2 starts from a state where `npm run build` succeeds and the app
runs locally without errors.

### Input state
- `npm run dev` works because Vite's dev server does not execute the `build.rollupOptions.input` block.
- `npm run build` fails silently: Rollup cannot find `src/dev/draw.html` (file is at `public/dev/draw.html`).
- Three pre-computed emissions JSON files sit in `public/data/` with no frontend consumer.
- No `build` or `type-check` scripts exist in `package.json`.
- `typescript` and `@types/node` are absent from `devDependencies`.

### Output state
- `npm run build` completes without errors.
- `npm run type-check` runs `tsc --noEmit` against the `app/` directory.
- All data files in `public/data/` are accounted for in `DATA_CONTRACTS.md`.
- Dead data files are either removed from `public/data/` or explicitly documented as unused.

### Concrete task list

1. **Fix the draw build input in `vite.config.js`.**
   Change:
   ```
   draw: path.resolve(__dirname, "src/dev/draw.html")
   ```
   To:
   ```
   draw: path.resolve(__dirname, "public/dev/draw.html")
   ```
   This is the only change required to unblock `npm run build`.

2. **Add missing scripts to `package.json`.**
   Add under `"scripts"`:
   ```json
   "build": "vite build",
   "preview": "vite preview",
   "type-check": "tsc --noEmit"
   ```

3. **Add missing dev dependencies.**
   Run:
   ```
   npm install --save-dev typescript @types/node
   ```
   Both are required: `typescript` for `tsc --noEmit`, `@types/node` for
   `path.resolve` in `vite.config.js` to resolve correctly under strict TS.

4. **Verify `tsconfig.json` include paths.**
   Confirm that `"include": ["app", "vite-env.d.ts"]` resolves correctly now
   that `app/cesium-init.ts` and `app/vite-env.d.ts` exist. The standalone
   `"vite-env.d.ts"` entry at root level will not match anything — remove it
   from the include array. The `"app"` glob covers the file inside `app/`.

5. **Document and decide on the three dead emissions files.**
   Files: `zone_emissions_daily.json`, `zone_emissions_estimated.json`,
   `zone_emissions_monthly.json`.
   These are daily-granularity pre-computed outputs from the dissertation
   Jupyter analysis. They are not consumed by `main.js`, which computes
   emissions on the fly. Decision: either delete them from `public/data/`
   (they are analysis artefacts, not app assets) or move them to
   `analysis/outputs/` where they belong. Do not leave unused JSON files
   in the public directory — they will be bundled and served for nothing.

6. **Run `npm run build` and confirm it exits cleanly.**
   This is the acceptance test for Phase 1b.

### Dependencies
None. This is the first phase.

### Risks
Risk: `vite-plugin-cesium` may cause build warnings about worker chunks even
after the path fix. These are cosmetic — the build output is still valid.
Do not chase these warnings in Phase 1b.

Risk: `tsc --noEmit` will report type errors in `app/cesium-init.ts` (the
`viewer: any` parameters and the unused `targetDistance` variable). These are
expected and are scheduled for Phase 2. The goal of Phase 1b is a passing
Vite build, not a clean TypeScript compilation.

### Recommended next step
Fix the `vite.config.js` draw input path first (task 1), then run
`npm run build` to confirm. Do the remaining tasks only after confirming
the build passes — this isolates the fix from any accidental regressions.

---

## Phase 2 — TypeScript tightening

### Objective
Convert the entire codebase to typed TypeScript with `strict: true`, zero
implicit `any`, and a passing `tsc --noEmit` run.

### Input state
- `npm run build` passes (Phase 1b complete).
- `main.js` is 859 lines of untyped JavaScript.
- `app/cesium-init.ts` exists but uses `viewer: any` in five function signatures
  and casts two `ScreenSpaceEventController` properties with `as any`.
- One unused variable (`targetDistance`) exists in `cesium-init.ts`.
- One wrong Cesium type: `new Cartesian3(0, -20, 0)` used as `pixelOffset`
  on a label entity — should be `new Cesium.Cartesian2(0, -20)`.
- `main.js` imports `cesium-init` using a named import of `init3dGoogleViewer`.
  The function is exported correctly.

### Output state
- `main.js` is renamed to `src/main.ts` (or `app/main.ts` — see note below).
- All application interfaces are defined and used: `Zone`, `AQEntry`,
  `TrafficData`, `CorrResult`, `Assumptions`, `SensorEntity`.
- `app/cesium-init.ts` passes `tsc --noEmit` with no errors or suppressions.
- `npm run type-check` exits with code 0.
- `npm run build` still passes.

### Concrete task list

1. **Decide on source layout before writing any TypeScript.**
   Currently `app/` contains only `cesium-init.ts` and `vite-env.d.ts`.
   `main.js` is at the project root. The `tsconfig.json` include covers `app/`.
   Option A: move `main.js` → `app/main.ts` and keep all source in `app/`.
   Option B: widen `tsconfig.json` include to `["."]` and rename `main.js` → `main.ts` at root.
   Recommendation: Option A. It is consistent with the existing `app/cesium-init.ts`
   placement and avoids accidentally including node_modules or public files in the TS
   compilation scope.

2. **Rename `main.js` → `app/main.ts` and update `index.html`.**
   `index.html` line 160: change `src="/main.js"` to `src="/app/main.ts"`.
   Vite handles `.ts` entry points natively — no additional config needed.

3. **Define interfaces in a new file `app/types.ts`.**
   Minimum required interfaces:
   ```typescript
   interface AQEntry { no2?: number; pm25?: number; pm10?: number; o3?: number; }
   interface TrafficData { [timestamp: string]: { [zoneId: string]: number } }
   interface CorrResult { bestR: number; bestLag: number; n: number; all: Record<number, { r: number; n: number }> }
   interface Assumptions {
     shares: { car: number; lgv: number; hgv: number; bus: number };
     ef:     { car: number; lgv: number; hgv: number; bus: number };
     dz:     Record<string, number>;
   }
   interface Zone {
     polygon: Cesium.Entity;
     metricPolygons: Record<string, Cesium.Entity>;
     trafficPolygon: Cesium.Entity;
     overlay: HTMLDivElement;
     isVisible: boolean;
     aqMap: Record<string, AQEntry> | null;
     latestAQ: { ts: string; values: AQEntry } | null;
     latestTraffic: { ts: string; count: number } | null;
     latestEmissions: { ts: string; kg: number } | null;
     coordsRing: [number, number][];
     sensors: Cesium.Entity[];
   }
   ```

4. **Type `app/cesium-init.ts`.**
   Replace all `viewer: any` with `viewer: Cesium.Viewer`.
   Remove `targetDistance` (unused variable, strict mode will error).
   Remove `init2dGoogleViewer` export (dead code — it is never imported anywhere).
   Cast removal for `enableInputs` and `zoomToCursorEnabled`: these properties
   are not in the public Cesium type definitions. Keep `as any` casts on these
   two lines only, with a comment explaining why.

5. **Fix the `pixelOffset` type error in `app/main.ts`.**
   Line (formerly `main.js` line 347):
   Change `pixelOffset: new Cartesian3(0, -20, 0)` to `pixelOffset: new Cesium.Cartesian2(0, -20)`.
   Add `Cartesian2` to the named imports from `"cesium"`.

6. **Replace the hardcoded Wikipedia pin image with an inline SVG data URI.**
   `billboard.image` currently points to an external Wikipedia URL with no
   fallback. Replace with:
   ```typescript
   const PIN_SVG = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'
     width='16' height='16'><circle cx='8' cy='8' r='7' fill='%23e53935'/></svg>`;
   ```
   This eliminates the external dependency entirely.

7. **Clean up dead UI: assumptions panel G2/G3/G12 distance inputs.**
   `ZONE_NAMES = ["G1"]` is the only active zone. The assumptions panel in
   `index.html` has inputs for `dz-G2`, `dz-G3`, `dz-G12`. These are read
   into `assumptions.dz` by `readAssumptionsFromUI()` but have no effect.
   Remove the three input rows from `index.html` and remove `G2`/`G3` reads
   from `readAssumptionsFromUI()`. Leave `dz-G12` removal as a comment for
   now — it may become relevant if G12 zone is activated in future.

8. **Run `npm run type-check` and resolve all remaining errors.**
   Do not suppress errors with `// @ts-ignore` except where documented above.

### Dependencies
Phase 1b must be complete.

### Risks
Risk: Cesium's TypeScript definitions are sometimes incomplete or inaccurate
for newer API surfaces (particularly `ScreenSpaceEventController` properties).
Where the types are genuinely wrong in the library, use `as unknown as X`
with a comment rather than a bare `as any`.

Risk: Moving `main.js` to `app/main.ts` and updating the `index.html` script
tag may trigger a Vite HMR cache issue on first run after the change. Clear
`.vite/deps` if the dev server throws a stale module error.

### Recommended next step
Create `app/types.ts` with all interfaces before touching `main.js`. Having the
types defined first means the rename and rewrite of `main.js` → `app/main.ts`
can be done in a single pass with full type coverage, rather than iteratively
fixing cascading errors.

---

## Phase 3 — OpenAQ live integration

### Objective
Replace the static `g1_air_quality_animated.json` file with a live feed from
the OpenAQ v3 API, updating on a 15-minute polling interval, and integrate
hourly bucketing so that the existing correlation and compare-mode logic
continues to work against live data.

### Input state
- Phase 2 complete: fully typed codebase.
- AQ data is loaded from `/data/g1_air_quality_animated.json` as a static file.
- `loadAllAQData()` in `main.ts` fetches this file on startup and populates
  `zones[name].aqMap` as a `Record<string, AQEntry>` keyed by timestamp string.
- `compareTimeline` is built as an exact string intersection of AQ and traffic
  timestamps. This will not work with live data unless timestamps are normalised.
- No backend server exists.

### Output state
- A Node/Express server exists at `server/index.ts`, running on port 5055.
- The server exposes `GET /aq/latest` which returns the last 48 hours of G1
  AQ data from OpenAQ, bucketed to hourly intervals, in the existing
  `Record<string, AQEntry>` schema.
- The frontend polls this endpoint every 15 minutes and merges new entries
  into `zones["G1"].aqMap` without a full page reload.
- `compareTimeline` construction uses floor-to-hour bucketing on both AQ and
  traffic timestamps before computing the intersection.
- Historical AQ JSON files remain in `public/data/` as fallback. The app
  loads them on startup if the `/aq/latest` endpoint is unreachable, then
  upgrades to live data once the server responds.

### Concrete task list

1. **Create `server/` directory and initialise a TypeScript Express app.**
   Files to create: `server/index.ts`, `server/routes/aq.ts`,
   `server/services/openaq.ts`, `server/tsconfig.json`.
   Add `express` and `node-fetch` (or use native `fetch` if Node >= 18)
   to `package.json` dependencies. Add a `"server"` script:
   `"server": "tsx server/index.ts"`.

2. **Implement `server/services/openaq.ts`.**
   Target endpoint: `https://api.openaq.org/v3/locations/{locationId}/measurements`
   with parameters `limit=100&order_by=datetime&sort=desc`.
   The location ID for Glasgow G1 is `2574` (confirmed from the existing
   `openaq_location_2574_measurments_g1_main.csv` filename).
   Parse the response into `Record<string, AQEntry>` using floor-to-hour
   bucketing: `new Date(Math.floor(ts / 3600000) * 3600000).toISOString()`.
   Average multiple readings that fall into the same hour bucket.

3. **Implement `server/routes/aq.ts`.**
   Cache the OpenAQ response in memory for 14 minutes (OpenAQ rate limit
   is 60 requests/minute on the free tier; polling every 15 minutes is safe).
   Return the cached result immediately on subsequent requests within the
   cache window. Return HTTP 503 with a JSON error body if the upstream
   call fails — do not return a 200 with empty data.

4. **Add hourly bucketing to `compareTimeline` construction in `app/main.ts`.**
   The current intersection logic uses exact string equality on timestamp keys.
   Add a `bucketToHour(ts: string): string` utility that floors any timestamp
   string to `YYYY-MM-DD HH:00:00`. Apply this when building both `aqiTimeline`
   and `trafficTimeline` before computing the intersection.

5. **Add live polling to the frontend.**
   In `app/main.ts`, after initial load, call `setInterval` every 15 minutes
   to fetch `/api/aq/latest` and merge new entries into `zones["G1"].aqMap`.
   Regenerate `aqiTimeline` and `compareTimeline` after each merge.
   Update the slider `max` attribute if the timeline has grown.

6. **Add graceful fallback to historical data.**
   On startup, attempt `/api/aq/latest` first. If it fails (network error or
   non-200), fall back to loading `g1_air_quality_animated.json` from
   `public/data/`. Log clearly which source was used.

7. **Update `vite.config.js` proxy to ensure `/api/aq` routes to the server.**
   The existing proxy already covers `/api` → `localhost:5055`. No change
   needed unless the Express router is mounted at a different prefix.

8. **Test both live and fallback paths locally before marking phase complete.**

### Dependencies
Phase 2 must be complete. An OpenAQ API key is required (free tier, register
at https://openaq.org). Add `VITE_OPENAQ_API_KEY` to `.env`.

### Risks
Risk: OpenAQ free tier enforces a rate limit of 60 requests/minute. Polling
every 15 minutes from the server (not the browser) means one request per
15-minute interval — well within the limit. Do not poll from the browser
directly; it would multiply the request count by the number of open tabs.

Risk: OpenAQ data for Glasgow G1 (location 2574) may have gaps of several
hours in the live feed, as it did in the historical dataset (coverage was
~97% for NO2, ~96% for PM2.5). The bucketing logic must tolerate missing
hours without crashing the correlation computation.

Risk: The live AQ schema from OpenAQ v3 differs from the pre-processed
`AQEntry` shape. The raw API returns individual parameter readings as
separate objects in a `results` array, not as a combined object per
timestamp. The `openaq.ts` service must aggregate these explicitly.

### Recommended next step
Build and test `server/services/openaq.ts` in isolation first — write a
standalone script that calls the API and prints the bucketed output — before
wiring it into the Express routes or touching the frontend.

---

## Phase 4 — Google Maps traffic integration

### Objective
Replace the static `zone_traffic_aggregated.json` file with a live traffic
feed and integrate it into the existing traffic visualisation and CO2
estimation layer.

### Unresolved architectural decision (must be resolved before coding begins)

The current app model requires a single integer per zone per hour:
`trafficData[timestamp]["G1"] = vehicleCount`. This feeds the CO2 estimator
(`vehicleCount × effectiveEF × distanceInZone`) and the Pearson correlation.

The Google Maps Roads API (`roads.googleapis.com/v1/speedLimits` and
`snapToRoads`) returns speed ratios per individual road segment, not vehicle
counts per zone. The two options are:

**Option A: Speed-to-count proxy via linear scaling.**
Map each road segment's current speed ratio (current / speed limit) to an
estimated flow using the Greenshields linear speed-flow model:
`flow ≈ k_jam × speed_ratio × (1 - speed_ratio)` where `k_jam` is an assumed
jam density (vehicles/km). Sum flows across all road segments within the G1
polygon to get a zone-level vehicle count.
Tradeoff: requires assuming `k_jam` (a free parameter with no ground truth
in this dataset), introduces significant uncertainty into the CO2 estimate,
and the Greenshields model is a gross simplification of real traffic dynamics.
The CO2 estimate becomes a proxy of a proxy.

**Option B: Use the Distance Matrix API or Routes API to estimate throughput
from travel-time degradation.**
Query a set of origin-destination pairs within G1 every 15 minutes. Compute
the ratio of live travel time to free-flow travel time. Use this degradation
ratio as a relative traffic index rather than an absolute vehicle count.
Rescale to the historical vehicle count range from `zone_traffic_aggregated.json`
to maintain visual continuity with the existing extrusion heights.
Tradeoff: the output is a dimensionless index, not a vehicle count. The CO2
estimate becomes meaningless in absolute terms. The correlation analysis
remains valid as a relative measure.

Recommended next step: Adopt Option B for the visualisation layer (it is
more honest about what the API provides) but retain the historical
`zone_traffic_aggregated.json` as the baseline for correlation analysis.
Live traffic feeds the visual extrusion only; the correlation panel should
display a note that it reflects the historical analysis window, not live data.
Resolve this explicitly with a written decision before writing any Phase 4
code, and update this plan accordingly.

### Input state
- Phase 3 complete: OpenAQ live feed working.
- Traffic data loaded from static `public/data/zone_traffic_aggregated.json`.
- The architectural decision above has been made and documented.

### Output state
- `server/routes/traffic.ts` exposes `GET /traffic/latest` returning the
  current traffic index for G1, normalised to the historical vehicle count
  range.
- The frontend polls this endpoint every 5 minutes (traffic changes faster
  than AQ) and updates the traffic extrusion in real time.
- Historical traffic data remains available for the correlation panel.
- The CO2 estimate panel carries a disclaimer that live values are index-based.

### Concrete task list (contingent on architectural decision)

1. Enable the Google Maps Roads API and Distance Matrix API in Google Cloud Console.
   Add `VITE_GOOGLE_MAPS_API_KEY` if not already present (it is already in
   `.env` for the tileset — confirm it has Roads API permission enabled).

2. Create `server/services/traffic.ts`.
   Define a fixed set of 6-8 origin-destination pairs within the G1 bounding
   box. Query the Routes API for live travel times. Compute degradation ratio
   against free-flow baseline derived from the historical dataset.

3. Create `server/routes/traffic.ts`. Cache results for 4 minutes.

4. Update `loadTrafficData()` in `app/main.ts` to poll `/api/traffic/latest`
   after loading the historical baseline. Merge live entries into `trafficData`.

5. Add a visible label to the traffic overlay indicating when the data is live
   vs historical.

6. Test that CO2 estimates update correctly and that the disclaimer is visible.

### Dependencies
Phase 3 must be complete. Google Maps Roads API must be enabled on the
existing Google Cloud project. The architectural decision documented above
must be confirmed in writing before task 1 begins.

### Risks
Risk: The Google Maps Roads API is not free. Routes API requests are billed
per query. With 8 OD pairs polled every 5 minutes, this is approximately
2,300 requests per day. Verify this is within budget before enabling billing.

Risk: The `VITE_GOOGLE_MAPS_API_KEY` currently in `.env` is used for the
Cesium photorealistic tileset (Google Photorealistic 3D Tiles). Adding Roads
API access to the same key is fine, but the key must have the correct API
restrictions updated in the Google Cloud Console.

### Recommended next step
Before writing any code, manually call the Routes API from the command line
with your existing API key to confirm it has the right permissions, then
measure the response time and confirm the OD pairs fall within the G1 boundary.

---

## Phase 5 — Docker and Railway deployment

### Objective
Package the application as a Docker container and deploy it to Railway with a
live public URL.

### Input state
- Phase 4 complete: both live feeds working locally.
- The app has a frontend (Vite build output) and a backend (Express server).
- No Dockerfile, `.dockerignore`, or Railway config exists.

### Output state
- A single Docker image builds the frontend and serves it alongside the
  Express API using a multi-stage Dockerfile.
- Railway deployment runs from this image.
- All environment variables are set in the Railway dashboard, not in the image.
- A live public URL exists and the app loads correctly from a fresh browser
  with no localhost dependency.

### Concrete task list

1. **Write a multi-stage `Dockerfile`.**
   Stage 1 (builder): `node:20-alpine`, install deps, run `npm run build`.
   Stage 2 (runtime): `node:20-alpine`, copy built frontend to `dist/`,
   copy `server/` source, install production deps only, start Express.
   The Express server must serve the Vite `dist/` directory as static files
   in addition to the `/api` routes. Add `express.static` middleware pointing
   at `dist/`.

2. **Write `.dockerignore`.**
   Exclude: `node_modules/`, `.env`, `analysis/`, `doc/`, `*.pptx`,
   `public/data/*.csv`, `public/data/zone_emissions_*.json`.

3. **Confirm Express listens on `process.env.PORT || 5055`.**
   Railway injects `PORT` as an environment variable. The server must not
   hardcode 5055 as the only option.

4. **Create `railway.json` (or `railway.toml`) at the project root.**
   Set `build.dockerfilePath = "Dockerfile"` and `deploy.startCommand`
   if Railway cannot infer it from the Dockerfile `CMD`.

5. **Create a Railway project and link to the GitHub repository.**
   Set all environment variables in the Railway dashboard:
   `VITE_CESIUM_ION_TOKEN`, `VITE_GOOGLE_MAPS_API_KEY`, `OPENAQ_API_KEY`.
   Note: Vite embeds `VITE_*` variables at build time. This means the
   Docker build stage must have access to these variables. In Railway, set
   them as build arguments in addition to runtime environment variables.

6. **Trigger a deploy and verify the live URL.**
   Acceptance test: open the URL in a fresh incognito window. The 3D Glasgow
   map should load, the AQ and traffic overlays should populate within 30
   seconds, and the assumptions panel should function.

### Dependencies
Phase 4 must be complete.

### Risks
Risk: `VITE_*` variables are baked into the JavaScript bundle at build time by
Vite. If Railway runs the Docker build without these variables available as
build args, the tileset and geocoder will fail silently in the deployed build.
This is the most common deployment failure for Vite + CesiumJS apps on Railway.
Verify this explicitly by checking the Railway build log for the variable names.

Risk: The Google Photorealistic 3D Tiles Terms of Service require that the
tileset is only used within Google Maps contexts. Deploying to a public URL
on Railway is technically permitted, but ensure the `onlyUsingWithGoogleGeocoder: true`
flag remains set in `cesium-init.ts` — removing it may violate the ToS.

Risk: The Cesium Ion token is tied to a user account with a free-tier monthly
request limit. A public deployment will consume this quota faster. Monitor
usage in the Cesium Ion dashboard after deployment.

### Recommended next step
Build the Docker image locally first (`docker build -t gcm .`) and run it
with `docker run -p 5055:5055 --env-file .env gcm` before pushing to Railway.
This confirms the multi-stage build works before introducing Railway's build
pipeline.

---

## Phase 6 — README and documentation

### Objective
Produce a complete, professional README that serves as both a technical
reference for developers and a demonstration document for the MSc dissertation
portfolio.

### Input state
- Phase 5 complete: live public URL exists.
- A `README` file (no extension) exists at root. Its contents are unknown —
  review before writing the new one.

### Output state
- `README.md` at the project root (replace the existing `README`).
- Covers: project description, live demo link, methodology summary,
  architecture overview, local setup instructions, environment variable
  reference, and a note on the dissertation context.
- At least two screenshots embedded (3D map view, correlation overlay).

### Concrete task list

1. Delete or archive the existing `README` file.
2. Write `README.md` covering the sections listed below.
3. Take screenshots of the running app: one showing the AQ extrusion view,
   one showing the compare mode with correlation values in the overlay.
4. Add screenshots to a `doc/screenshots/` directory and embed in the README.
5. Verify all links (live demo URL, OpenAQ location page, Cesium Ion) are valid.

### README sections (required)

- **Project title and one-sentence description**
- **Live demo** — link to Railway URL
- **Screenshots** — two inline images
- **What this is** — dissertation context, Glasgow G1, the research question
  (lagged correlation between traffic and AQ), CO2 estimation methodology
- **Correlation findings** — state the key results from the dissertation:
  NO2 r=0.190 at lag -14h (AQ leads), O3 r=-0.398 at lag -18h (AQ leads).
  PM2.5 and PM10 were not statistically significant at the minimum n threshold.
- **Architecture** — brief description of the tech stack: CesiumJS, Vite,
  TypeScript, Express, OpenAQ API, Google Maps APIs, Docker, Railway
- **Local setup** — step-by-step: clone, `npm install`, copy `.env_template`
  to `.env`, fill in keys, `npm run dev`
- **Environment variables** — table: name, purpose, where to obtain
- **Data sources** — OpenAQ location 2574 (G1), Google Photorealistic 3D Tiles,
  historical traffic data (source to be confirmed)
- **Limitations and caveats** — CO2 estimate methodology, traffic index proxy,
  single-zone focus

### Dependencies
Phase 5 must be complete. Screenshots cannot be taken until the live
deployment exists.

### Risks
Risk: The existing `README` file at root may contain dissertation-sensitive
content. Review it before deleting.

### Recommended next step
Write the README structure first (all section headings with placeholder text),
then fill in sections in order of importance: demo link and screenshots first,
methodology and findings second, setup instructions third.