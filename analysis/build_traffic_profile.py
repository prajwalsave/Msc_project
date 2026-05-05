import json
from datetime import datetime
from pathlib import Path

def main():
    in_path = Path("public/data/zone_traffic_aggregated.json")
    out_path = Path("public/data/zone_traffic_profile.json")

    with open(in_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Temporary groupings: profile[dow][hour] = [counts]
    profile = {str(d): {str(h): [] for h in range(24)} for d in range(7)}

    for ts_str, counts in data.items():
        val = counts.get("G1")
        if val is None or not isinstance(val, (int, float)):
            continue
            
        dt = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
        dow = dt.weekday()
        hour = dt.hour
        
        profile[str(dow)][str(hour)].append(val)

    # Compute averages
    out_profile = {}
    total_cells = 0
    total_sum = 0
    total_count = 0
    min_avg = float('inf')
    max_avg = float('-inf')

    for d in range(7):
        out_profile[str(d)] = {}
        for h in range(24):
            vals = profile[str(d)][str(h)]
            if vals:
                avg = round(sum(vals) / len(vals), 2)
                out_profile[str(d)][str(h)] = avg
                
                total_cells += 1
                total_sum += sum(vals)
                total_count += len(vals)
                
                if avg < min_avg: min_avg = avg
                if avg > max_avg: max_avg = avg

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out_profile, f, indent=2)

    print("SUMMARY TABLE (Rows: Days 0-6, Cols: Hours 0-23):")
    for d in range(7):
        row_str = [f"{out_profile[str(d)].get(str(h), 0):>6.2f}" for h in range(24)]
        print(f"Day {d}: " + " | ".join(row_str))

    print("\n--- STATISTICS ---")
    print(f"Total cells populated: {total_cells}/168")
    print(f"Min average count: {min_avg}")
    print(f"Max average count: {max_avg}")
    if total_count > 0:
        print(f"Overall mean count: {round(total_sum / total_count, 2)}")

if __name__ == "__main__":
    main()
