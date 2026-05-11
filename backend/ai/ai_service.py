import json
import os
import requests
import pandas as pd
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime, timedelta
from fastapi.middleware.cors import CORSMiddleware

# ----------------------------------------------------------------------
# 1. Load pre‑trained climate database (optional, for fast startup)
# ----------------------------------------------------------------------
CLIMATE_FILE = "climate_data.json"
climate_cache: Dict[str, dict] = {}

if os.path.exists(CLIMATE_FILE):
    with open(CLIMATE_FILE, "r") as f:
        climate_cache = json.load(f)
    print(f"Loaded pre‑computed climate data for {len(climate_cache)} locations")
else:
    print("No pre‑computed file found – will fetch data on demand.")

# ----------------------------------------------------------------------
# FastAPI app
# ----------------------------------------------------------------------
app = FastAPI(title="Yarik Weather AI – worldwide")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------------------------
# Request models
# ----------------------------------------------------------------------
class PredictRequest(BaseModel):
    lat: float
    lon: float
    city: str
    lang: str = "en"

class TodayRequest(BaseModel):
    temperature: float
    wind_speed: float
    condition: str
    pressure: float
    sea_temperature: Optional[float] = None
    uv_index: float = 0.0
    precipitation_probability: float = 0.0
    humidity: Optional[float] = 50
    hourly: List[dict] = []
    daily: List[dict] = []
    lang: str = "en"
    coastal: bool = False

# ----------------------------------------------------------------------
# Climate helpers (live fallback when missing)
# ----------------------------------------------------------------------
def fetch_live_climate(lat: float, lon: float) -> dict:
    """Download 5 years of daily data and compute monthly averages & trends."""
    end = datetime.now().strftime("%Y-%m-%d")
    start = (datetime.now() - timedelta(days=365 * 5)).strftime("%Y-%m-%d")

    url = (
        f"https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={lat}&longitude={lon}"
        f"&start_date={start}&end_date={end}"
        f"&daily=temperature_2m_mean,precipitation_sum,uv_index_max"
        f"&timezone=auto"
    )
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    daily = resp.json()["daily"]

    df = pd.DataFrame(daily)
    df["time"] = pd.to_datetime(df["time"])
    df["month"] = df["time"].dt.month
    df["year"] = df["time"].dt.year

    df["temperature_2m_mean"] = pd.to_numeric(df["temperature_2m_mean"], errors="coerce")
    df["precipitation_sum"] = pd.to_numeric(df["precipitation_sum"], errors="coerce")
    df["uv_index_max"] = pd.to_numeric(df["uv_index_max"], errors="coerce")

    monthly = {}
    trends = {}

    peak_uv = 12.0 * np.cos(np.radians(lat))

    for m in range(1, 13):
        mask = df["month"] == m
        m_data = df.loc[mask]

        temp_avg = m_data["temperature_2m_mean"].mean()
        precip_avg = m_data["precipitation_sum"].mean()
        uv_avg = m_data["uv_index_max"].mean()

        # temperature trend
        trend = None
        yearly = m_data.groupby("year")["temperature_2m_mean"].mean().dropna()
        if len(yearly) >= 3:
            years = yearly.index.values.astype(float)
            temps = yearly.values
            slope, intercept = np.polyfit(years, temps, 1)
            trend = {"slope": slope, "intercept": intercept}

        # UV estimate if missing
        seasonal = max(0, 1.0 - abs(m - 7) / 6.0)
        uv_est = round(peak_uv * seasonal, 1)
        uv_final = uv_avg if (pd.notna(uv_avg) and uv_avg > 0.1) else uv_est

        monthly[str(m)] = {
            "temp": 0.0 if pd.isna(temp_avg) else round(temp_avg, 1),
            "precip": 0.0 if pd.isna(precip_avg) else round(precip_avg, 1),
            "uv": uv_final,
        }
        if trend is not None:
            trends[str(m)] = trend

    return {"monthly": monthly, "trends": trends}


def get_climate(lat: float, lon: float) -> dict:
    """Return climate data from cache, or fetch + cache it."""
    key = f"{lat:.2f}_{lon:.2f}"
    if key not in climate_cache:
        print(f"Fetching climate data for ({lat}, {lon}) …")
        climate_cache[key] = fetch_live_climate(lat, lon)
    return climate_cache[key]


def predict_period(climate, target_month, num_months, target_year=None):
    monthly = climate["monthly"]
    trends = climate.get("trends", {})

    temps, precips, uvs = [], [], []
    for i in range(num_months):
        m = (target_month - 1 + i) % 12 + 1
        m_str = str(m)

        base_temp = monthly[m_str]["temp"]
        trend = trends.get(m_str)
        if trend and target_year:
            temp_val = trend["slope"] * target_year + trend["intercept"]
        else:
            temp_val = base_temp
        temps.append(temp_val)

        precips.append(monthly[m_str]["precip"])
        uvs.append(monthly[m_str]["uv"])

    return {
        "avg_temp": round(np.mean(temps), 1) if temps else 0,
        "total_rain": round(sum(precips) * (7 if num_months == 1 else 30), 1),
        "max_uv": round(max(uvs), 1) if uvs else 0,
    }


# ----------------------------------------------------------------------
# Heuristic helpers (unchanged)
# ----------------------------------------------------------------------
def rain_flag(cond, prob):
    c = cond.lower()
    return 1 if ("rain" in c or "drizzle" in c or prob >= 30) else 0


def comfort(temp, wind, uv, prob, is_rain):
    prob_fraction = prob / 100.0
    s = (
        10.0
        - abs(temp - 21.0) * 0.15
        - wind * 0.2
        - prob_fraction * 2.0
        - max(0.0, uv - 8.0) * 0.5
        - (2.0 if is_rain else 0.0)
    )
    return round(max(0.0, min(10.0, s)), 1)


def walk(temp, wind, uv, prob, is_rain):
    prob_fraction = prob / 100.0
    s = (
        8.0
        - abs(temp - 18.0) * 0.2
        - wind * 0.25
        - prob_fraction * 2.5
        - (3.0 if is_rain else 0.0)
        - (2.0 if uv > 8 else 0.0)
    )
    return round(max(0.0, min(10.0, s)), 1)


def swim(temp, sea_temp, month, is_rain, coastal):
    if not coastal or not sea_temp or sea_temp <= 17:
        return 0.0
    s = 5 + (temp - 20) * 0.15
    if month in [6, 7, 8]:
        s += 1.5
    if month in [11, 12, 1, 2, 3]:
        s -= 2.0
    if is_rain:
        s -= 2.0
    return round(max(0, min(10, s)), 1)


# ----------------------------------------------------------------------
# Endpoints
# ----------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok", "climate_locations": len(climate_cache)}

@app.post("/predict")
def predict_weather(req: PredictRequest):
    climate = get_climate(req.lat, req.lon)
    now = datetime.now()
    target_year = now.year

    week_pred = predict_period(climate, now.month, 1, target_year)

    months = []
    for offset in range(1, 7):
        m = (now.month + offset - 1) % 12 + 1
        year = now.year + (now.month + offset - 1) // 12
        mon_pred = predict_period(climate, m, 1, year)
        mon_pred["month"] = m
        months.append(mon_pred)

    return {"next_week": week_pred, "next_months": months}


@app.post("/today")
def today_recommendations(req: TodayRequest):
    lang = req.lang
    cond = req.condition.lower()
    temp = req.temperature
    wind = req.wind_speed
    uv = req.uv_index
    prob = req.precipitation_probability
    sea_temp = req.sea_temperature
    hourly = req.hourly
    coastal = req.coastal

    is_rain = rain_flag(req.condition, prob)
    month = datetime.now().month

    c = comfort(temp, wind, uv, prob, is_rain)
    w = walk(temp, wind, uv, prob, is_rain)
    s = swim(temp, sea_temp, month, is_rain, coastal)

    tips = []

    # Clothing
    if "rain" in cond or "drizzle" in cond:
        if "heavy" in cond or "violent" in cond:
            tips.append("🌧️ Сильный дождь! Оставайтесь дома, если возможно." if lang=="ru" else "🌧️ Heavy rain! Stay indoors if possible.")
        else:
            tips.append("🌂 Возьмите зонт и наденьте непромокаемую обувь." if lang=="ru" else "🌂 Bring an umbrella and wear waterproof shoes.")
    elif "snow" in cond:
        tips.append("❄️ Снегопад – одевайтесь тепло, нескользящая обувь." if lang=="ru" else "❄️ Snowfall – wear warm, non-slip shoes.")
    elif temp < 0:
        tips.append("Очень холодно! 🧣 Пуховик, шапка, перчатки." if lang=="ru" else "🧣 Bitter cold! Down jacket, hat, gloves.")
    elif temp < 10:
        tips.append("Холодно – 🧥 тёплая куртка и шарф." if lang=="ru" else "🧥 Cold – warm jacket and scarf.")
    elif temp < 18:
        tips.append("Прохладно – 👕 лёгкая куртка или свитер." if lang=="ru" else "👕 Cool – light jacket or sweater.")
    elif temp < 26:
        tips.append("Комфортно – 👕 можно в футболке." if lang=="ru" else "👕 Comfortable – t-shirt is fine.")
    else:
        tips.append("Жарко! 🩳 Лёгкая одежда, пейте больше воды💧." if lang=="ru" else "🩳 Hot! Light clothes, stay hydrated.")

    tips.append(f"⭐ Комфорт: {c}/10" if lang=="ru" else f"⭐ Comfort: {c}/10")
    tips.append(f"🚶 Прогулка: {w}/10" if lang=="ru" else f"🚶 Walk: {w}/10")

    if uv >= 6:
        tips.append("🧴 Ультрафиолетовый индекс высокий – используйте солнцезащитный крем." if lang=="ru" else "🧴 High UV index – use sunscreen.")

    if coastal:
        if sea_temp and sea_temp > 17:
            tips.append(f"🏊 Купание: {s}/10 (вода {sea_temp:.0f}°C)" if lang=="ru" else f"🏊 Swim: {s}/10 (water {sea_temp:.0f}°C)")
        else:
            tips.append("🏖️ Море слишком холодное для купания." if lang=="ru" else "🏖️ Sea too cold for swimming.")

    # Best times
    if hourly:
        best_walk_time, best_walk_score = None, -1
        best_swim_time, best_swim_score = None, -1
        now_hour = datetime.now().hour
        for h in hourly:
            h_time = h.get("time", "")
            h_temp = h.get("temperature", temp)
            h_wind = h.get("wind_speed", wind)
            h_uv = h.get("uv_index", uv)
            h_prob = h.get("precipitation_probability", 0)
            h_cond = h.get("condition", "")
            h_is_rain = rain_flag(h_cond, h_prob)
            h_walk = walk(h_temp, h_wind, h_uv, h_prob, h_is_rain)
            if h_walk > best_walk_score:
                best_walk_score = h_walk
                best_walk_time = h_time

            h_hour = int(h_time.split(":")[0]) if h_time else now_hour
            if coastal and sea_temp and sea_temp > 17 and 10 <= h_hour <= 18:
                h_swim = swim(h_temp, sea_temp, month, h_is_rain, coastal)
                if h_swim > best_swim_score:
                    best_swim_score = h_swim
                    best_swim_time = h_time

        if best_walk_time:
            tips.append(f"🚶‍♂️ Лучшее время для прогулки: {best_walk_time}" if lang=="ru" else f"🚶 Best walk time: {best_walk_time}")
        if best_swim_time:
            tips.append(f"🏊 Лучшее время для купания: {best_swim_time}" if lang=="ru" else f"🏊 Best swim time: {best_swim_time}")

    return {"recommendations": tips}