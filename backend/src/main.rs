use axum::{Json, Router, extract::Path, http::StatusCode, response::IntoResponse, routing::get};
use chrono::{Datelike, Duration, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, f64::consts::PI};
use tower_http::cors::{Any, CorsLayer};

const PORT: u16 = 3000;
const MOON_API_KEY: &str = "YOUR_API_KEY_HERE";

// ---------- Geocoding ----------
#[derive(Debug, Deserialize)]
struct GeocodingResponse {
    results: Vec<GeocodingResult>,
}

#[derive(Debug, Deserialize)]
struct GeocodingResult {
    latitude: f64,
    longitude: f64,
}

// ---------- Open-Meteo Forecast ----------
#[derive(Debug, Deserialize)]
struct OpenMeteoForecast {
    current: CurrentWeather,
    daily: DailyForecast,
}

#[derive(Debug, Deserialize)]
struct CurrentWeather {
    temperature_2m: f64,
    wind_speed_10m: f64,
    weather_code: u8,
}

#[derive(Debug, Deserialize)]
struct DailyForecast {
    time: Vec<String>,
    temperature_2m_max: Vec<f64>,
    temperature_2m_min: Vec<f64>,
    wind_speed_10m_max: Vec<f64>,
    weather_code: Vec<u8>,
    sunrise: Vec<String>,
    sunset: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoArchive {
    daily: ArchiveDaily,
}

#[derive(Debug, Deserialize)]
struct ArchiveDaily {
    time: Vec<String>,
    temperature_2m_max: Vec<f64>,
    temperature_2m_min: Vec<f64>,
    wind_speed_10m_max: Vec<f64>,
    weather_code: Vec<u8>,
}

// ---------- FreeAstro Moon Month ----------
#[derive(Debug, Deserialize)]
struct MoonMonthResponse {
    days: Vec<MoonDay>,
}

#[derive(Debug, Deserialize)]
struct MoonDay {
    calendar_date: String,
    phase: MoonPhaseInfo,
}

#[derive(Debug, Deserialize)]
struct MoonPhaseInfo {
    name: String,
    illumination: f64,
    is_waxing: Option<bool>,
}

// ---------- Unified Response ----------
#[derive(Debug, Serialize)]
struct WeatherResponse {
    city: String,
    current: CurrentData,
    yesterday: DailyData,
    forecast: Vec<DailyData>,
}

#[derive(Debug, Serialize)]
struct CurrentData {
    temperature: f64,
    wind_speed: f64,
    condition: String,
}

#[derive(Debug, Serialize)]
struct DailyData {
    date: String,
    temperature_max: f64,
    temperature_min: f64,
    wind_speed_max: f64,
    condition: String,
    sunrise: Option<String>,
    sunset: Option<String>,
    moon_phase_name: Option<String>,
    moon_illumination: Option<f64>,
}

// ---------- Weather Code Descriptions ----------
fn weather_description(code: u8) -> &'static str {
    match code {
        0 => "Clear sky",
        1 => "Mainly clear",
        2 => "Partly cloudy",
        3 => "Overcast",
        45 => "Fog",
        48 => "Depositing rime fog",
        51 => "Light drizzle",
        53 => "Moderate drizzle",
        55 => "Dense drizzle",
        56 => "Light freezing drizzle",
        57 => "Dense freezing drizzle",
        61 => "Slight rain",
        63 => "Moderate rain",
        65 => "Heavy rain",
        66 => "Light freezing rain",
        67 => "Heavy freezing rain",
        71 => "Slight snow fall",
        73 => "Moderate snow fall",
        75 => "Heavy snow fall",
        77 => "Snow grains",
        80 => "Slight rain showers",
        81 => "Moderate rain showers",
        82 => "Violent rain showers",
        85 => "Slight snow showers",
        86 => "Heavy snow showers",
        95 => "Thunderstorm",
        96 => "Thunderstorm with slight hail",
        99 => "Thunderstorm with heavy hail",
        _ => "Unknown",
    }
}

// ---------- Moon helpers ----------
fn normalize_illumination(value: f64) -> f64 {
    if value <= 1.5 { value * 100.0 } else { value }
}

fn moon_phase_for_date(date: NaiveDate) -> (String, f64) {
    const SYNODIC_MONTH: f64 = 29.530_588_67;

    let reference_new_moon = NaiveDate::from_ymd_opt(2000, 1, 6).unwrap();
    let days_since_reference = (date - reference_new_moon).num_days() as f64;

    let mut age = days_since_reference % SYNODIC_MONTH;
    if age < 0.0 {
        age += SYNODIC_MONTH;
    }

    let illumination = ((1.0 - (2.0 * PI * age / SYNODIC_MONTH).cos()) / 2.0) * 100.0;

    let phase_name = match age {
        a if a < 1.84566 => "New Moon",
        a if a < 5.53699 => "Waxing Crescent",
        a if a < 9.22831 => "First Quarter",
        a if a < 12.91963 => "Waxing Gibbous",
        a if a < 16.61096 => "Full Moon",
        a if a < 20.30228 => "Waning Gibbous",
        a if a < 23.99361 => "Last Quarter",
        a if a < 27.68493 => "Waning Crescent",
        _ => "New Moon",
    };

    (phase_name.to_string(), illumination.clamp(0.0, 100.0))
}

async fn fetch_moon_month(
    lat: f64,
    lon: f64,
    year: i32,
    month: u32,
) -> Result<MoonMonthResponse, String> {
    let url = format!(
        "https://api.freeastroapi.com/api/v1/moon/month?year={}&month={}&lat={:.4}&lon={:.4}&include_zodiac=true&include_traditional_moon=true&include_sign_timeline=true",
        year, month, lat, lon
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("x-api-key", MOON_API_KEY)
        .send()
        .await
        .map_err(|e| format!("Moon API request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Moon API error {}: {}", status, body));
    }

    response
        .json::<MoonMonthResponse>()
        .await
        .map_err(|e| format!("Failed to parse moon JSON: {}", e))
}

async fn moon_for_date(
    lat: f64,
    lon: f64,
    date: &str,
    moon_cache: &mut HashMap<(i32, u32), MoonMonthResponse>,
) -> (String, f64) {
    let parsed = match NaiveDate::parse_from_str(date, "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => return moon_phase_for_date(Local::now().date_naive()),
    };

    let key = (parsed.year(), parsed.month());

    if !moon_cache.contains_key(&key) {
        if let Ok(month_data) = fetch_moon_month(lat, lon, key.0, key.1).await {
            moon_cache.insert(key, month_data);
        }
    }

    if let Some(month_data) = moon_cache.get(&key) {
        if let Some(day) = month_data.days.iter().find(|d| d.calendar_date == date) {
            return (
                day.phase.name.clone(),
                normalize_illumination(day.phase.illumination),
            );
        }
    }

    moon_phase_for_date(parsed)
}

// ---------- Geocoding ----------
async fn get_coordinates(city: &str) -> Result<(f64, f64), String> {
    let encoded = urlencoding::encode(city);
    let url = format!(
        "https://geocoding-api.open-meteo.com/v1/search?name={}&count=1&language=en&format=json",
        encoded
    );

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Geocoding request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Geocoding API error: {}", response.status()));
    }

    let data: GeocodingResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse geocoding JSON: {}", e))?;

    let first = data
        .results
        .first()
        .ok_or_else(|| format!("City '{}' not found", city))?;

    Ok((first.latitude, first.longitude))
}

// ---------- Forecast ----------
async fn fetch_forecast(lat: f64, lon: f64) -> Result<OpenMeteoForecast, String> {
    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={:.4}&longitude={:.4}&current=temperature_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,weather_code,sunrise,sunset&timezone=auto",
        lat, lon
    );

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Forecast request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Forecast API error: {}", response.status()));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse forecast JSON: {}", e))
}

// ---------- Yesterday's Weather ----------
async fn fetch_yesterday(
    lat: f64,
    lon: f64,
    moon_cache: &mut HashMap<(i32, u32), MoonMonthResponse>,
) -> Result<DailyData, String> {
    let yesterday_date = (Local::now() - Duration::days(1)).date_naive();
    let yesterday = yesterday_date.format("%Y-%m-%d").to_string();

    let url = format!(
        "https://archive-api.open-meteo.com/v1/archive?latitude={:.4}&longitude={:.4}&start_date={}&end_date={}&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,weather_code&timezone=auto",
        lat, lon, yesterday, yesterday
    );

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Historical request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Historical API error: {}", response.status()));
    }

    let data: OpenMeteoArchive = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse historical JSON: {}", e))?;

    if data.daily.time.is_empty() {
        return Err("No historical data available".to_string());
    }

    let (moon_phase_name, moon_illumination) =
        moon_for_date(lat, lon, &yesterday, moon_cache).await;

    Ok(DailyData {
        date: data.daily.time[0].clone(),
        temperature_max: data.daily.temperature_2m_max[0],
        temperature_min: data.daily.temperature_2m_min[0],
        wind_speed_max: data.daily.wind_speed_10m_max[0],
        condition: weather_description(data.daily.weather_code[0]).to_string(),
        sunrise: None,
        sunset: None,
        moon_phase_name: Some(moon_phase_name),
        moon_illumination: Some(moon_illumination),
    })
}

// ---------- Main Handler ----------
async fn get_weather(Path(city): Path<String>) -> impl IntoResponse {
    let (lat, lon) = match get_coordinates(&city).await {
        Ok(coords) => coords,
        Err(e) => return (StatusCode::BAD_REQUEST, e).into_response(),
    };

    let (forecast_result, moon_cache_seed) = (
        fetch_forecast(lat, lon),
        HashMap::<(i32, u32), MoonMonthResponse>::new(),
    );

    let forecast = match forecast_result.await {
        Ok(f) => f,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    };

    let mut moon_cache = moon_cache_seed;

    let yesterday = match fetch_yesterday(lat, lon, &mut moon_cache).await {
        Ok(y) => y,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    };

    let current = CurrentData {
        temperature: forecast.current.temperature_2m,
        wind_speed: forecast.current.wind_speed_10m,
        condition: weather_description(forecast.current.weather_code).to_string(),
    };

    let daily = &forecast.daily;
    let mut forecast_days: Vec<DailyData> = Vec::with_capacity(daily.time.len());

    for (i, date) in daily.time.iter().enumerate() {
        let (moon_phase_name, moon_illumination) =
            moon_for_date(lat, lon, date, &mut moon_cache).await;

        forecast_days.push(DailyData {
            date: date.clone(),
            temperature_max: daily.temperature_2m_max[i],
            temperature_min: daily.temperature_2m_min[i],
            wind_speed_max: daily.wind_speed_10m_max[i],
            condition: weather_description(daily.weather_code[i]).to_string(),
            sunrise: daily.sunrise.get(i).cloned(),
            sunset: daily.sunset.get(i).cloned(),
            moon_phase_name: Some(moon_phase_name),
            moon_illumination: Some(moon_illumination),
        });
    }

    let response = WeatherResponse {
        city,
        current,
        yesterday,
        forecast: forecast_days,
    };

    (StatusCode::OK, Json(response)).into_response()
}

#[tokio::main]
async fn main() {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/get_weather/{city}", get(get_weather))
        .layer(cors);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{PORT}"))
        .await
        .expect(&format!("Failed to bind port {}", PORT));

    println!("Server starting on port {}", PORT);
    axum::serve(listener, app).await.expect("Server failed");
}
