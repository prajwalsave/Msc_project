# PHASE_PLAN.md

Glasgow Carbon Map — Execution Roadmap
Updated after Phase 3 completion and data strategy review (May 2026).

This document supersedes all previous versions of PHASE_PLAN.md.
Do not proceed to any phase without completing the phase before it.

---

## Completed phases

Phase 1b — Config and data fix: COMPLETE (commit: pre-Phase 2)
Phase 2  — TypeScript migration: COMPLETE (commit: Phase 2)
Phase 3  — OpenAQ live integration: COMPLETE (commit: 767d783)

---

## Data strategy

Air quality data source: OpenAQ v3 API, location 2574 (Glasgow Townhead).
Live feed: server polls every 15 minutes via GET /aq/latest.
Historical fallback: public/data/g1_air_quality_animated.json
Coverage: May 2023 to present. All four parameters (no2, pm25, pm10, o3)
at 97-99% hourly coverage within the active window.

Traffic data source: Li, Zhao and Wang (2025), Scientific Data 12:253.
"High-resolution traffic flow data from the urban traffic control system
in Glasgow." DOI: 10.1038/s41597-025-04494-y.
Published by the Urban Big Data Centre, University of Glasgow.
Licensed under Creative Commons Attribution 4.0.
Coverage: October 2019 to September 2023, 33,644 hourly records.
File: public/data/zone_traffic_aggregated.json

AQ and traffic overlap window for correlation: May 2023 to September 2023.
2,214 hours of aligned hourly data confirmed.

Traffic live strategy: time-of-day historical profile (Position 1).
The server computes average vehicle counts per hour-of-day and
day-of-week from the full four-year traffic dataset, stores them
in a profile file, and serves the profile entry matching the current
UTC time via GET /traffic/current. This is explicitly labelled in
the UI as a historical baseline. No external API required. No cost.

Deployment strategy: local only. Railway deployment is out of scope.
Distribution is via the GitHub repository. Any user can clone,
add API keys to .env, and run npm run dev:all to get the full
experience including the live AQ feed and the traffic profile.

---

## Phase 4 — Time-of-day traffic profile

### Objective
Replace the static zone_traffic_aggregated.json slider with a live-feeling
traffic layer that shows the historical average vehicle count for the
current hour of day and day of week, updating every 60 minutes.

### Input state
- Phase 3 complete: OpenAQ live feed working, server running at port 5055.
- Traffic data is loaded from the static file on startup and displayed
  via the existing slider. It does not update automatically.
- server/index.ts has one route (GET /aq/latest) and serves static files.
- public/data/zone_traffic_aggregated.json contains 33,644 hourly records
  across four years covering October 2019 to September 2023.

### Output state
- A preprocessing script (analysis/build_traffic_profile.py) reads
  zone_traffic_aggregated.json and writes a new file
  public/data/zone_traffic_profile.json containing average vehicle
  counts for each combination of day-of-week (0-6) and hour-of-day (0-23).
- server/index.ts has a new route GET /traffic/current that reads the
  current UTC time, looks up the matching profile entry, and returns
  { timestamp, count, dayOfWeek, hourOfDay, isProfile: true }.
- app/main.ts polls GET /api/traffic/current every 60 minutes and
  merges the returned count into trafficData under the current UTC
  hour timestamp, triggering a visual update.
- The traffic overlay in renderOverlay() displays a one-line disclaimer:
  "Traffic: historical avg (same hour/weekday)"
- npm run type-check passes. npm run build passes.
- The preprocessing script is committed to analysis/ and documented.

### Concrete task list

1. analysis/build_traffic_profile.py — CREATE
   Read public/data/zone_traffic_aggregated.json.
   For each record compute day-of-week (0=Monday, 6=Sunday) and
   hour-of-day (0-23) from the timestamp string.
   Group all G1 vehicle counts by (dayOfWeek, hourOfDay).
   Compute the mean for each group, rounded to two decimal places.
   Write public/data/zone_traffic_profile.json with this structure:
   {
     "0": { "0": 45.2, "1": 38.7, ..., "23": 52.1 },
     "1": { "0": 43.1, ... },
     ...
     "6": { "0": 31.4, ... }
   }
   Where the outer key is day-of-week string (0=Monday, 6=Sunday)
   and inner key is hour-of-day string (0-23).
   Print a summary table of all 168 cells on completion.

2. Run analysis/build_traffic_profile.py — COMMAND
   Confirm the output file is written to public/data/.
   Confirm all 168 cells (7 days x 24 hours) are populated.

3. app/types.ts — EDIT
   Add these new interfaces:
   TrafficProfileEntry: { [hour: string]: number }
   TrafficProfile: { [day: string]: TrafficProfileEntry }
   TrafficCurrentResponse: {
     timestamp: string;
     count: number;
     dayOfWeek: number;
     hourOfDay: number;
     isProfile: true;
   }

4. server/index.ts — EDIT
   Add cache variables for the traffic profile response with TTL 59 minutes.
   Add GET /traffic/current route. The route must be inserted before
   app.use(express.static) and before app.get(/.*/).
   The route reads the current UTC time via new Date().
   Extracts dayOfWeek using getUTCDay() (0=Sunday, 6=Saturday —
   JavaScript convention).
   Extracts hourOfDay using getUTCHours().
   Loads zone_traffic_profile.json on first call and caches in memory.
   Looks up profile[dayOfWeek][hourOfDay].
   Returns TrafficCurrentResponse.
   If the profile file cannot be read returns HTTP 503 with JSON error.
   Never returns 200 with null or undefined count.

   CRITICAL: The day-of-week convention must match between the Python
   script and the JavaScript server. The Python script uses
   0=Monday, 6=Sunday (Python weekday() convention).
   JavaScript getUTCDay() uses 0=Sunday, 6=Saturday.
   The server route must convert JavaScript day to Python convention:
     const jsDow = now.getUTCDay();
     const dow = jsDow === 0 ? 6 : jsDow - 1;
   This ensures Sunday lookup uses key "6" and Monday uses key "0",
   matching the profile file exactly.

5. app/main.ts — EDIT
   Add a new function fetchLiveTraffic() that:
   - Calls fetch("/api/traffic/current")
   - Parses the response as TrafficCurrentResponse
   - Builds a current UTC hour timestamp string in
     YYYY-MM-DD HH:00:00 format using the same bucketToHour logic
   - Inserts the count into trafficData under that key for zone G1
   - Rebuilds trafficTimeline by re-sorting Object.keys(trafficData)
   - Updates trafficMax if the new count exceeds the current value
   - Calls updateTrafficAtTimestamp() with the new key
   - On failure logs the error and does nothing (no crash)

   Add a 60-minute setInterval in the main IIFE after the existing
   aqPollInterval line:
     const trafficPollInterval = setInterval(
       fetchLiveTraffic, 60 * 60 * 1000
     );
     void trafficPollInterval;
   Also call fetchLiveTraffic() once immediately on startup so the
   current hour is visible without waiting 60 minutes.

6. app/main.ts renderOverlay() — EDIT
   Add this disclaimer line in the traffic section of the overlay,
   immediately after the "Vehicles/hour" line:
     <div style="font-size:10px;opacity:0.65;margin-top:2px;">
       Historical avg — same hour and weekday
     </div>
   This must only render when zone.latestTraffic is not null and
   when the latestTraffic object has no "isLive" flag set to false.
   The disclaimer is a hardcoded string literal injected into innerHTML.

### Dependencies
Phase 3 must be complete. zone_traffic_aggregated.json must exist
at public/data/. The preprocessing script (task 1) must run
successfully before the server route is added (task 4), because
the route reads the profile file at runtime.

### Risks
Risk: The day-of-week convention mismatch between Python and JavaScript
is the most likely source of silent bugs in this phase. A wrong day
lookup produces plausible-looking but incorrect vehicle counts with
no error. The conversion formula in task 4 is mandatory and must be
verified explicitly during testing by checking that Monday values
match the profile key "0".

Risk: If trafficMax is not updated after a live traffic insert, the
normalisation in updateTrafficAtTimestamp() may produce extrusion
heights above the maximum or below the minimum. fetchLiveTraffic()
must update trafficMax before calling updateTrafficAtTimestamp().

Recommended next step: Write and run analysis/build_traffic_profile.py
first and paste the summary table here before any other task begins.
The profile file must exist and be verified before the server route
is written.

---

## Phase 5 — Project hardening and local setup

### Objective
Ensure the project runs cleanly on a fresh clone with zero prior
knowledge, tighten the codebase for public release, and produce a
clean local development experience that any researcher can reproduce.

### Input state
- Phases 1b through 4 complete.
- The project runs locally but has rough edges: the README is a draft
  with placeholder notes, .env_template may not match the current
  variable set, draw.html and draw.js are undocumented dev tools,
  and the analysis/ folder has no unified documentation.

### Output state
- A developer who clones the repo fresh can follow README.md and
  have the app running in under 10 minutes.
- npm run dev:all starts both processes cleanly with no manual steps
  beyond filling in .env.
- All environment variables in .env_template are current and correct.
- The analysis/ folder has a README explaining what each script does
  and in what order to run them.
- Unused or confusing files are cleaned up or documented.
- npm run type-check and npm run build both pass cleanly.

### Concrete task list

1. Audit .env_template against all variables used in the codebase.
   Add any missing variables, remove any stale ones, annotate each
   with a comment explaining where to obtain the value.
   Current expected variables:
   VITE_CESIUM_ION_TOKEN — from cesium.ion dashboard
   VITE_GOOGLE_MAPS_API_KEY — from Google Cloud Console
   OPENAQ_API_KEY — from explore.openaq.org/register

2. Audit package.json scripts. Confirm all scripts work on a fresh
   npm install. Add:
   "clean": "rimraf dist"
   Install rimraf as a dev dependency for cross-platform compatibility.

3. Move the raw OpenAQ CSV files from public/data/ to analysis/data/.
   These files are not used by the running app and should not be
   served as public assets or included in the Vite build.
   Files to move: all openaq_location_*.csv files.
   Update .gitignore if needed.

4. Delete public/data/g1_air_quality_animated.json.bak — this is
   the backup created by the fetch script and has no place in git.
   Add *.bak to .gitignore to prevent future backups being committed.

5. Write analysis/README.md documenting:
   - fetch_extended_aq.py: purpose, when to run, dependencies,
     expected output
   - build_traffic_profile.py: purpose, when to run, dependencies,
     expected output
   - 01_g1_corr.ipynb: purpose, key findings, how to run

6. Add a comment block at the top of src/dev/draw.js explaining
   it is a development tool for drawing zone boundaries in the
   Cesium viewer and outputting GeoJSON, not part of the main app.

7. Run npm run build one final time and confirm clean output.
   Run npm run type-check and confirm zero errors.

8. Commit all changes:
   git add .
   git commit -m "Phase 5: project hardening and local setup"
   git push origin main

### Dependencies
Phase 4 must be complete.

### Risks
Risk: The openaq_location_*.csv files in public/data/ are each
100-700KB. Moving them to analysis/data/ reduces the public asset
footprint and prevents Vite from processing them unnecessarily.

Risk: *.bak files committed to git cannot be easily removed from
history without a rebase. Catch them with .gitignore now.

Recommended next step: Start with the .env_template audit. Every
variable must be correct before a fresh-clone test is meaningful.

---

## Phase 6 — README and documentation

### Objective
Produce a complete, professional README.md that serves as both a
technical reference and a dissertation portfolio document.

### Input state
- Phase 5 complete: project runs cleanly on a fresh clone.
- A README file (no .md extension) exists at root with draft content
  including placeholder notes ("I haven't done this yet").
- Screenshots do not exist yet.

### Output state
- README.md at the project root replaces the existing README file.
- Covers all sections listed below in full.
- Two screenshots embedded from doc/screenshots/.
- All links are valid.

### README sections required

1. Project title and one-sentence description

2. Screenshots — two inline images:
   - The 3D Glasgow map with AQ extrusion visible
   - Compare mode with correlation values in the overlay panel

3. What this is — dissertation context, University of Glasgow MSc
   Computing Science, Glasgow G1 postcode zone, the research question
   (do hourly traffic volumes predict air quality changes, and at
   what lag?), CO2 estimation methodology summary

4. Correlation findings — the key results from the analysis:
   NO2:  r=0.190 at lag -14h (AQ leads traffic), n=939,
         95% CI [0.128, 0.251] — statistically significant
   O3:   r=-0.398 at lag -18h (AQ leads traffic), n=931,
         95% CI [-0.450, -0.342] — statistically significant
   PM2.5: r=-0.049 at lag -9h, n=908,
          95% CI [-0.114, 0.016] — not significant
   PM10:  r=0.048 at lag +20h, n=897,
          95% CI [-0.017, 0.114] — not significant

5. Architecture — CesiumJS + Vite + TypeScript frontend,
   Express backend, OpenAQ v3 API for live AQ,
   Glasgow SCOOT historical traffic dataset,
   Google Photorealistic 3D Tiles via Cesium Ion

6. Local setup — step by step:
   Prerequisites: Node.js >= 18, Python >= 3.10 (for analysis scripts)
   1. Clone the repository
   2. npm install
   3. Copy .env_template to .env and fill in all three keys
   4. npm run dev:all
   5. Open http://localhost:3000

7. Environment variables — table with columns:
   Variable name | Purpose | Where to obtain | Required

8. Data sources — with full citations:
   OpenAQ location 2574 (Glasgow Townhead, UK)
   Li Y, Zhao Q, Wang M (2025). High-resolution traffic flow data
   from the urban traffic control system in Glasgow.
   Scientific Data 12:253. DOI: 10.1038/s41597-025-04494-y.
   Google Photorealistic 3D Tiles via Cesium Ion

9. How to use the app — brief walkthrough of the three modes
   (AQ, Traffic, Compare), the pin click to open zone overlays,
   the correlation panel, and the assumptions panel

10. Limitations and caveats:
    CO2 estimate is a first-order approximation using fleet share
    assumptions — not suitable for official reporting.
    Traffic layer shows a historical time-of-day average, not
    live vehicle counts. Explicitly labelled in the UI.
    AQ data covers May 2023 to present for this location.
    Analysis focuses on G1 postcode zone only.

11. Licence and attribution —
    Code: MIT licence
    Traffic data: CC BY 4.0, cite Li et al. (2025)
    AQ data: OpenAQ open licence

### Dependencies
Phase 5 must be complete. Screenshots require the app to be running.

### Risks
Risk: The existing README file contains draft notes. Review it before
deleting — some content may be worth preserving.

Recommended next step: Take the two screenshots first before writing
any prose. Screenshots are the hardest asset to retrofit and having
them locks in the visual presentation early.