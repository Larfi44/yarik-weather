import requests
import pandas as pd
import numpy as np
import json
import time
from datetime import datetime, timedelta

# ----------------------------------------------------------------------
# Russian cities (coastal + inland)
# ----------------------------------------------------------------------
CITIES = [
    # Coastal
    "Sochi", "Vladivostok", "Kaliningrad", "Murmansk", "Arkhangelsk",
    "Saint Petersburg", "Novorossiysk", "Anapa", "Gelendzhik", "Tuapse",
    "Nakhodka", "Magadan", "Petropavlovsk-Kamchatsky", "Yuzhno-Sakhalinsk",
    # Crimea
    "Sevastopol", "Yalta", "Alushta", "Sudak", "Feodosia", "Kerch",
    "Yevpatoria", "Simferopol",
    # Mainland Russia
    "Moscow", "Krasnodar", "Khabarovsk", "Volgograd", "Kazan",
    "Yekaterinburg", "Novosibirsk", "Omsk", "Samara", "Rostov-on-Don",
    "Ufa", "Perm", "Voronezh", "Krasnoyarsk", "Saratov",
    "Tolyatti", "Izhevsk", "Barnaul", "Ulyanovsk", "Irkutsk",
    "Vladikavkaz", "Yakutsk", "Chita", "Bratsk", "Angarsk",
]

climate_db = {}

def get_coords(city):
    url = f"https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1"
    resp = requests.get(url, timeout=10).json()
    if "results" not in resp or not resp["results"]:
        return None, None
    return resp["results"][0]["latitude"], resp["results"][0]["longitude"]

def fetch_and_process(lat, lon):
    """Download data with retry on server errors (429, 500, 502, 503, 504)."""
    end = datetime.now().strftime("%Y-%m-%d")
    start = (datetime.now() - timedelta(days=365*5)).strftime("%Y-%m-%d")
    url = (
        f"https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={lat}&longitude={lon}"
        f"&start_date={start}&end_date={end}"
        f"&daily=temperature_2m_mean,precipitation_sum,uv_index_max"
        f"&timezone=auto"
    )

    max_retries = 2
    for attempt in range(max_retries):
        resp = requests.get(url, timeout=30)
        if resp.status_code == 200:
            break
        # If too many requests or server error, wait and retry
        if resp.status_code in (429, 500, 502, 503, 504):
            wait = 5 * (attempt + 1)
            print(f"  (attempt {attempt+1} failed, retrying in {wait}s...)")
            time.sleep(wait)
        else:
            raise Exception(f"API error {resp.status_code}")
    else:
        raise Exception(f"API error after {max_retries} retries")

    daily = resp.json()["daily"]
    df = pd.DataFrame(daily)
    df["time"] = pd.to_datetime(df["time"])
    df["month"] = df["time"].dt.month
    df["year"]  = df["time"].dt.year

    df["temperature_2m_mean"] = pd.to_numeric(df["temperature_2m_mean"], errors="coerce")
    df["precipitation_sum"]   = pd.to_numeric(df["precipitation_sum"], errors="coerce")
    df["uv_index_max"]        = pd.to_numeric(df["uv_index_max"], errors="coerce")

    monthly = {}
    trends = {}

    peak_uv = 12.0 * np.cos(np.radians(lat))

    for m in range(1, 13):
        mask = df["month"] == m
        month_data = df.loc[mask]

        temp_avg   = month_data["temperature_2m_mean"].mean()
        precip_avg = month_data["precipitation_sum"].mean()
        uv_avg     = month_data["uv_index_max"].mean()

        trend = None
        yearly_temps = month_data.groupby("year")["temperature_2m_mean"].mean().dropna()
        if len(yearly_temps) >= 3:
            years = yearly_temps.index.values.astype(float)
            temps = yearly_temps.values
            slope, intercept = np.polyfit(years, temps, 1)
            trend = {"slope": slope, "intercept": intercept}

        seasonal = max(0, 1.0 - abs(m - 7) / 6.0)
        uv_est = round(peak_uv * seasonal, 1)
        uv_final = uv_avg if (pd.notna(uv_avg) and uv_avg > 0.1) else uv_est

        monthly[str(m)] = {
            "temp": 0.0 if pd.isna(temp_avg) else round(temp_avg, 1),
            "precip": 0.0 if pd.isna(precip_avg) else round(precip_avg, 1),
            "uv": uv_final
        }

        if trend is not None:
            trends[str(m)] = trend

    return {"monthly": monthly, "trends": trends}

print("Pre‑computing climate data for all cities …")
for city in CITIES:
    print(f"  {city} …", end=" ")
    lat, lon = get_coords(city)
    if lat is None:
        print("coordinates not found, skipping")
        continue
    try:
        data = fetch_and_process(lat, lon)
        climate_db[f"{lat:.2f}_{lon:.2f}"] = data
        print("done")
    except Exception as e:
        print(f"error: {e}")

    # Be polite to the API – wait 1 second between cities
    time.sleep(1)

with open("climate_data.json", "w") as f:
    json.dump(climate_db, f, indent=2)

print(f"✅ climate_data.json saved with {len(climate_db)} cities")