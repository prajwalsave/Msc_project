# Environment & Configuration

This project requires secure environment variables to fetch map tiles and 3D geospatial data. Because this is a Vite project, environment variables are prefixed with `VITE_` and are injected into the client-side bundle via `import.meta.env`.

## Required Keys

To run the application locally, you must create a `.env` file at the root of `Main_project/` (at the same level as `vite.config.js`).

```env
# Cesium ION Authentication
VITE_CESIUM_ION_TOKEN="your_cesium_ion_token_here"

# Google Maps Platform Authentication
VITE_GOOGLE_MAPS_API_KEY="your_google_maps_api_key_here"

# (Optional) Secondary token definition based on TypeScript environment mappings
VITE_CESIUM_ION_ACCESS_TOKEN="your_cesium_ion_token_here"
```

### Acquiring Keys

1.  **Google Maps API Key**: 
    *   Go to the Google Cloud Console.
    *   Enable the **Map Tiles API** (specifically required for Photorealistic 3D Tiles).
    *   Generate an API Key and restrict it to your HTTP referrers if deploying to production.
2.  **Cesium ION Token**:
    *   Create an account at [Cesium ion](https://ion.cesium.com/).
    *   Navigate to Access Tokens and create a new token with read access to the global 3D content.

## Local Server Configuration

The `vite.config.js` dictates the local development server behavior:
*   **Port**: `3000` (Strictly enforced, will fail if port is in use).
*   **API Proxy**: Any network calls initiated from the frontend to `/api/*` are intercepted and forwarded to `http://localhost:5055`. 
    *   *Note: While the frontend currently reads static datasets directly from `/data/`, this proxy rule indicates the intent to bind to a local Node.js/Express companion backend in future iterations.*
