"""
fetch_extended_aq.py

Downloads full measurement history for OpenAQ location 2574
(Glasgow Townhead) across all four sensors, aggregates to hourly
buckets, and writes the result to public/data/g1_air_quality_animated.json.

Run from project root:
    python analysis/fetch_extended_aq.py

Requires: requests, python-dotenv
Install:  pip install requests python-dotenv
"""

import json
import os
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

load_dotenv()

API_KEY   = os.getenv("OPENAQ_API_KEY", "")
BASE_URL  = "https://api.openaq.org/v3"
OUT_PATH  = Path("public/data/g1_air_quality_animated.json")

FETCH_FROM = datetime(2022, 10, 4,  19, 0, 0, tzinfo=timezone.utc)
FETCH_TO   = datetime(2023, 9, 30, 23, 0, 0, tzinfo=timezone.utc)
CHUNK_DAYS = 30

SENSORS = {
    5079312: "pm10",
    5079313: "pm25",
    5079314: "o3",
    5079315: "no2",
}

LIMIT   = 1000
PAUSE_S = 0.5

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def bucket_to_hour(iso: str) -> str:
    """Truncate any ISO-8601 UTC string to YYYY-MM-DD HH:00:00."""
    d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return d.strftime("%Y-%m-%d %H:00:00")


def fetch_sensor_measurements(sensor_id: int, param: str) -> list[dict]:
    """Fetch measurements in monthly chunks to avoid server timeouts."""
    headers = {"Accept": "application/json"}
    if API_KEY:
        headers["X-API-Key"] = API_KEY

    all_results = []
    chunk_start = FETCH_FROM

    while chunk_start < FETCH_TO:
        chunk_end = min(chunk_start + timedelta(days=CHUNK_DAYS), FETCH_TO)

        date_from = chunk_start.strftime("%Y-%m-%dT%H:%M:%SZ")
        date_to   = chunk_end.strftime("%Y-%m-%dT%H:%M:%SZ")

        page            = 1
        chunk_collected = 0

        while True:
            params = {
                "datetime_from": date_from,
                "datetime_to":   date_to,
                "limit":         LIMIT,
                "page":          page,
            }

            url = f"{BASE_URL}/sensors/{sensor_id}/measurements"

            try:
                r = requests.get(
                    url, headers=headers, params=params, timeout=30
                )
            except requests.exceptions.Timeout:
                print(f"  Timeout on {param} {date_from[:7]} "
                      f"page {page} — retrying in 10s")
                time.sleep(10)
                continue

            if r.status_code == 429:
                print(f"  Rate limited on {param} — waiting 60s")
                time.sleep(60)
                continue

            if r.status_code == 408:
                print(f"  408 timeout on {param} {date_from[:7]} "
                      f"page {page} — retrying in 10s")
                time.sleep(10)
                continue

            if r.status_code >= 500:
                print(f"  Server error {r.status_code} on {param} "
                      f"{date_from[:7]} page {page} — retrying in 15s")
                time.sleep(15)
                continue

            r.raise_for_status()
            data  = r.json()
            batch = data.get("results", [])

            if not batch:
                break

            all_results.extend(batch)
            chunk_collected += len(batch)

            if len(batch) < LIMIT:
                break

            page += 1
            time.sleep(PAUSE_S)

        print(f"  {param} {date_from[:7]}: {chunk_collected} measurements")
        chunk_start = chunk_end + timedelta(seconds=1)
        time.sleep(PAUSE_S)

    print(f"  {param} total: {len(all_results)} measurements")
    return all_results


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    if not API_KEY:
        print("WARNING: OPENAQ_API_KEY not found in environment.")
        print("Requests will be unauthenticated and may be rate-limited.")
        print("Add OPENAQ_API_KEY to your .env file and retry.\n")

    # bucket_data[hour_string][param] = list of float values
    bucket_data: dict[str, dict[str, list[float]]] = defaultdict(
        lambda: defaultdict(list)
    )

    for sensor_id, param in SENSORS.items():
        print(f"\nFetching {param} (sensor {sensor_id})...")
        measurements = fetch_sensor_measurements(sensor_id, param)

        skipped = 0
        for m in measurements:
            try:
                ts  = m["period"]["datetimeTo"]["utc"]
                val = float(m["value"])
                if val < 0:
                    skipped += 1
                    continue
                hour_key = bucket_to_hour(ts)
                bucket_data[hour_key][param].append(val)
            except (KeyError, TypeError, ValueError):
                skipped += 1
                continue

        if skipped:
            print(f"  {param}: skipped {skipped} invalid readings")

    # Average multiple readings that fall into the same hour bucket
    output: dict[str, dict[str, float]] = {}
    for hour_key in sorted(bucket_data.keys()):
        entry: dict[str, float] = {}
        for param, values in bucket_data[hour_key].items():
            if values:
                entry[param] = round(sum(values) / len(values), 2)
        if entry:
            output[hour_key] = entry

    # ---------------------------------------------------------------------------
    # Stats
    # ---------------------------------------------------------------------------

    total_hours = len(output)
    print(f"\n{'='*60}")
    print(f"DATASET SUMMARY")
    print(f"{'='*60}")
    print(f"Total hourly buckets: {total_hours}")

    if output:
        keys = sorted(output.keys())
        print(f"Date range: {keys[0]}  to  {keys[-1]}")

        print(f"\nCoverage per parameter:")
        for p in ["no2", "pm25", "pm10", "o3"]:
            count = sum(1 for v in output.values() if p in v)
            pct   = 100 * count / total_hours if total_hours else 0
            bar   = "#" * int(pct / 2)
            print(f"  {p:<6} {count:>5} hours  ({pct:5.1f}%)  {bar}")

        # Hours with all four parameters present
        complete = sum(
            1 for v in output.values()
            if all(p in v for p in ["no2", "pm25", "pm10", "o3"])
        )
        print(f"\n  All four params: {complete} hours "
              f"({100*complete/total_hours:.1f}%)")

        # Cross-check against traffic data
        traffic_path = Path("public/data/zone_traffic_aggregated.json")
        if traffic_path.exists():
            with open(traffic_path, encoding="utf-8") as f:
                traffic = json.load(f)
            traffic_keys = set(traffic.keys())
            aq_keys      = set(output.keys())
            overlap      = aq_keys & traffic_keys
            print(f"\nOverlap with traffic data: {len(overlap)} hours")
            if overlap:
                ol = sorted(overlap)
                print(f"  Overlap range: {ol[0]}  to  {ol[-1]}")
        else:
            print("\nTraffic data file not found — skipping overlap check.")

    # ---------------------------------------------------------------------------
    # Write output
    # ---------------------------------------------------------------------------

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Back up the existing file before overwriting
    backup_path = OUT_PATH.with_suffix(".json.bak")
    if OUT_PATH.exists():
        import shutil
        shutil.copy(OUT_PATH, backup_path)
        print(f"\nExisting file backed up to {backup_path}")

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(f"Written to {OUT_PATH}")
    print(f"\nDone. The app will use the extended dataset on next reload.")
    print(f"If something looks wrong, restore from {backup_path}")


if __name__ == "__main__":
    main()