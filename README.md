# Glasgow Carbon Map

## A CesiumJS-based 3D analysis of hourly traffic and air quality in Glasgow G1 — lagged correlations and CO₂ estimation

This project is an interactive 3D geospatial dashboard built as part of an MSc Computing Science dissertation at the University of Glasgow. It visualises hourly air quality and traffic data for the G1 postcode zone in Glasgow city centre, rendered on Google Photorealistic 3D Tiles via CesiumJS. The primary research question investigated was whether hourly traffic volumes predict air quality changes in Glasgow G1, and at what temporal lag. The application also implements a first-order CO₂ estimation model based on fleet composition assumptions to provide a preliminary assessment of urban emissions.

## Research findings

These are the key results from the Pearson lagged correlation analysis (±24h window) computed over the May–September 2023 overlap window between the two datasets.

| Metric | Best r | Lag (h) | Direction | n | Significant |
| :--- | :--- | :--- | :--- | :--- | :--- |
| NO₂ | −0.31 | −15 | AQ leads traffic | 939 | Yes |
| PM2.5 | −0.43 | −19 | AQ leads traffic | 908 | Yes |
| PM10 | −0.43 | −12 | AQ leads traffic | 897 | Yes |
| O₃ | −0.54 | −7 | AQ leads traffic | 931 | Yes |

Note that negative r for O₃ is expected because O₃ is consumed by NO and NOₓ emitted from vehicles, so higher traffic is associated with lower O₃ with a multi-hour lag.

The extended May–September 2023 window produces stronger correlations than the May–July 2023 window used in the original dissertation analysis.

## Architecture

The system is built using a modern web stack consisting of CesiumJS, Vite, and TypeScript for the frontend, and an Express backend running on Node.js. Live air quality data is retrieved from the OpenAQ v3 API every 15 minutes, while the historical traffic baseline is derived from the Glasgow SCOOT dataset. All data processing and visualisations are served locally, requiring no cloud deployment for basic operation.

| Component | Technology |
| :--- | :--- |
| 3D map | CesiumJS 1.131 + Google Photorealistic 3D Tiles |
| Frontend | Vite 7 + TypeScript (strict mode) |
| Backend | Express 5 + Node.js 22 |
| Live AQ feed | OpenAQ v3 API (location 2574, Glasgow Townhead) |
| Traffic data | Glasgow SCOOT dataset (Li et al., 2025) |
| Correlation | Pearson r, ±24h lag window, client-side |
| CO₂ model | First-order fleet composition estimate |

## Data sources

### Air quality

OpenAQ location 2574 — Glasgow Townhead (UKA00576). Parameters: NO₂, PM2.5, PM10, O₃. Coverage: October 2022 to present at hourly resolution. Open licence. URL: https://openaq.org

### Traffic

Li, Y., Zhao, Q. and Wang, M. (2025). High-resolution traffic flow data from the urban traffic control system in Glasgow. Scientific Data, 12, 253. DOI: https://doi.org/10.1038/s41597-025-04494-y Coverage: October 2019 to September 2023, 33,644 hourly records across Glasgow city centre. Licensed under CC BY 4.0. Published by the Urban Big Data Centre, University of Glasgow.

## Prerequisites

- Node.js >= 18 (tested on v22.14.0)
- Python >= 3.10 (required only to regenerate analysis outputs)
- Three API keys (see Environment variables section below)

## Local setup

1. Clone the repository
   ```bash
   git clone https://github.com/prajwalsave/Msc_project.git
   cd Msc_project
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Configure environment variables
   Copy .env_template to .env and fill in the three values. See the Environment variables section for where to obtain each key.

4. Start the application
   ```bash
   npm run dev:all
   ```
   This starts both the Vite dev server (port 3000) and the Express backend (port 5055) concurrently.

5. Open the app
   http://localhost:3000
   Click the red pin over Glasgow G1 to open the data overlays.

## Environment variables

| Variable | Purpose | Where to obtain | Required |
| :--- | :--- | :--- | :--- |
| VITE_CESIUM_ION_TOKEN | Cesium Ion access for Google 3D Tiles | ion.cesium.com/tokens | Yes |
| VITE_GOOGLE_MAPS_API_KEY | Google Photorealistic 3D Tiles | console.cloud.google.com | Yes |
| OPENAQ_API_KEY | OpenAQ v3 measurements API | explore.openaq.org/register | Yes |

The Google Maps API key requires the Maps Tile API to be enabled in Google Cloud Console. The project does not use the Routes API or any billed Google Maps services beyond the tile layer.

## How to use the app

### Viewing modes

Three buttons in the toolbar switch between Air Quality mode (four AQ metrics as extruded polygons), Traffic mode (vehicle count as an extruded footprint with historical average label), and Compare mode (both layers visible with the correlation summary in the overlay panel).

### Time navigation

Each mode has a time slider at the bottom of the screen. The play button (▶) beside each slider animates through the available timeline at one step per 500ms. Click the slider or press pause to stop.

### CO₂ assumptions

The Assumptions panel (⚙ button in the toolbar) exposes the fleet composition shares and emission factors used to compute the hourly CO₂ estimate. Values can be adjusted and reapplied interactively. These are first-order estimates only and are not suitable for official reporting.

## Project structure

```
Msc_project/
├── app/                    # TypeScript source
│   ├── main.ts             # Application logic and state
│   ├── cesium-init.ts      # CesiumJS viewer initialisation
│   ├── types.ts            # Shared TypeScript interfaces
│   └── vite-env.d.ts       # Vite environment type declarations
├── server/
│   └── index.ts            # Express API server
├── public/
│   └── data/               # Static data assets
│       ├── g1_air_quality_animated.json   # Historical AQ (G1)
│       ├── zone_traffic_aggregated.json   # Historical traffic
│       ├── zone_traffic_profile.json      # Time-of-day profile
│       ├── multi-zone.geojson             # Zone boundaries
│       └── locations.csv                  # Sensor locations
├── analysis/               # Research scripts and outputs
│   ├── 01_g1_corr.ipynb    # Correlation analysis notebook
│   ├── fetch_extended_aq.py
│   ├── build_traffic_profile.py
│   └── outputs/            # Generated charts and CSVs
├── src/dev/                # Development utilities
│   └── draw.js             # Zone boundary drawing tool
├── index.html
├── vite.config.js
└── package.json
```

## Limitations

- The correlation analysis covers a single zone (G1) and a single monitoring station (Glasgow Townhead). Results should not be generalised to other Glasgow zones without additional analysis.
- The traffic layer shows a historical time-of-day average derived from the 2019–2023 SCOOT dataset, not live vehicle counts. This is labelled clearly in the UI.
- The CO₂ estimate is a first-order approximation using assumed fleet composition shares. It does not account for vehicle speed, road gradient, or fuel type distribution.
- OpenAQ data for location 2574 is available from October 2022. PM10 and PM2.5 sensors stopped reporting in March 2026. NO₂ and O₃ sensors remain active.
- The lagged correlation method identifies statistical association, not causation. Confounding factors including meteorology, time of day, and seasonal variation are not controlled for in this analysis.
- The app requires three API keys to run. The Google Maps key incurs no cost for the tile layer at local development usage volumes.

## Licence and attribution

Code: MIT licence.

Traffic data: Li, Y., Zhao, Q. and Wang, M. (2025). Licensed under CC BY 4.0. Cite as: Li Y, Zhao Q, Wang M. High-resolution traffic flow data from the urban traffic control system in Glasgow. Sci Data 12, 253 (2025). https://doi.org/10.1038/s41597-025-04494-y

Air quality data: OpenAQ. Open licence. https://openaq.org

3D map tiles: Google Photorealistic 3D Tiles via Cesium Ion. Usage subject to Google Maps Platform Terms of Service.
