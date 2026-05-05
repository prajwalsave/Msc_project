# Glasgow Carbon Map

The Glasgow Carbon Map is a CesiumJS-based 3D visualization tool that integrates hourly traffic data with air quality measurements for the Glasgow G1 zone. It enables users to explore the spatial and temporal relationship between vehicle counts, estimated CO₂ emissions, and pollutant concentrations (NO₂, PM2.5, PM10, O₃) using a 7x24 historical profile and live OpenAQ updates.

## Prerequisites
- Node.js >= 18
- Python >= 3.10 (for analysis scripts only)

## Quick start
1. Clone the repository to your local machine.
2. Run `npm install` to install dependencies.
3. Copy `.env_template` to `.env`.
4. Fill in the required API keys for Cesium ION, Google Maps, and OpenAQ in the `.env` file.
5. Run `npm run dev:all` to launch both the Vite frontend and Express backend.
6. Open `http://localhost:3000` in your browser.

## Environment variables
| Variable | Purpose | Where to obtain |
| :--- | :--- | :--- |
| VITE_CESIUM_ION_TOKEN | Base map tiles and global context | [ion.cesium.com](https://ion.cesium.com/tokens) |
| VITE_GOOGLE_MAPS_API_KEY | Photorealistic 3D building tiles | [Google Cloud Console](https://console.cloud.google.com/google/maps-apis/credentials) |
| OPENAQ_API_KEY | Real-time air quality sensor data | [openaq.org](https://openaq.org/) |

## Data sources
- OpenAQ location 2574 (Glasgow Townhead)
- Li Y, Zhao Q, Wang M (2025). High-resolution traffic flow data from the urban traffic control system in Glasgow. Scientific Data 12:253. DOI: 10.1038/s41597-025-04494-y.

## Further documentation
See Phase 6 for full methodology, correlation findings, and screenshots.
