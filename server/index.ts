import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import type { AQDataEntry, OpenAQResponse } from "../app/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

const PORT = process.env.PORT || 5055;

const PARAM_MAP: Record<string, keyof AQDataEntry> = {
  no2: "no2",
  pm25: "pm25",
  pm10: "pm10",
  o3: "o3"
};

let cachedAQData: Record<string, AQDataEntry> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 14 * 60 * 1000;

app.get("/aq/latest", async (req, res) => {
  const now = Date.now();
  if (cachedAQData && (now - cacheTimestamp) < CACHE_TTL_MS) {
    res.json(cachedAQData);
    return;
  }
  
  try {
    const apiKey = process.env.OPENAQ_API_KEY;
    const headers: Record<string, string> = { "Accept": "application/json" };
    if (apiKey) headers["X-API-Key"] = apiKey;

    const locUrl = "https://api.openaq.org/v3/locations/2574";
    const locResponse = await fetch(locUrl, { headers });
    if (!locResponse.ok) {
      throw new Error(`OpenAQ API Error: ${locResponse.status} ${locResponse.statusText}`);
    }
    const locData = await locResponse.json();
    const sensors = locData.results[0]?.sensors || [];

    const allResults = [];
    for (const sensor of sensors) {
      const msUrl = `https://api.openaq.org/v3/sensors/${sensor.id}/measurements?limit=100`;
      const msResponse = await fetch(msUrl, { headers });
      if (msResponse.ok) {
        const msData = await msResponse.json();
        allResults.push(...msData.results);
      }
    }

    const result: Record<string, AQDataEntry> = {};
    
    for (const item of allResults) {
      const paramName = item.parameter?.name;
      if (!paramName || PARAM_MAP[paramName] === undefined) {
        continue;
      }
      
      const ts = item.period.datetimeTo.utc;
      if (!result[ts]) {
        result[ts] = {};
      }
      
      const mappedKey = PARAM_MAP[paramName];
      result[ts][mappedKey] = item.value;
    }
    
    cachedAQData = result;
    cacheTimestamp = Date.now();

    res.json(result);
  } catch (error) {
    console.error("Failed to fetch live AQ data:", error);
    res.status(500).json({ error: "Failed to fetch live AQ data" });
  }
});

// Serve Vite build in production
const distPath = path.join(__dirname, "../dist");
app.use(express.static(distPath));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
