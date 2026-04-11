use axum::{
    extract::Path,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use chrono::{Duration, Local};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

const PORT: u16 = 3000;

#[derive(Debug, Deserialize)]
struct GeocodingResponse {
    results: Vec<GeocodingResult>,
}

#[derive(Debug, Deserialize)]
struct GeocodingResult {
    latitude: f64,
    longitude: f64,
}

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
    moon_phase: Option<String>,
}

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

async fn fetch_yesterday(lat: f64, lon: f64) -> Result<DailyData, String> {
    let yesterday = (Local::now() - Duration::days(1)).format("%Y-%m-%d").to_string();

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

    Ok(DailyData {
        date: data.daily.time[0].clone(),
        temperature_max: data.daily.temperature_2m_max[0],
        temperature_min: data.daily.temperature_2m_min[0],
        wind_speed_max: data.daily.wind_speed_10m_max[0],
        condition: weather_description(data.daily.weather_code[0]).to_string(),
        sunrise: None,
        sunset: None,
        moon_phase: None,
    })
}

async fn get_weather(Path(city): Path<String>) -> impl IntoResponse {
    let (lat, lon) = match get_coordinates(&city).await {
        Ok(coords) => coords,
        Err(e) => return (StatusCode::BAD_REQUEST, e).into_response(),
    };

    let (forecast_result, yesterday_result) =
        tokio::join!(fetch_forecast(lat, lon), fetch_yesterday(lat, lon));

    let forecast = match forecast_result {
        Ok(f) => f,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    };

    let yesterday = match yesterday_result {
        Ok(y) => y,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    };

    let current = CurrentData {
        temperature: forecast.current.temperature_2m,
        wind_speed: forecast.current.wind_speed_10m,
        condition: weather_description(forecast.current.weather_code).to_string(),
    };

    let daily = &forecast.daily;
    let forecast_days: Vec<DailyData> = daily
        .time
        .iter()
        .enumerate()
        .map(|(i, date)| DailyData {
            date: date.clone(),
            temperature_max: daily.temperature_2m_max[i],
            temperature_min: daily.temperature_2m_min[i],
            wind_speed_max: daily.wind_speed_10m_max[i],
            condition: weather_description(daily.weather_code[i]).to_string(),
            sunrise: Some(daily.sunrise[i].clone()),
            sunset: Some(daily.sunset[i].clone()),
            moon_phase: None,
        })
        .collect();

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
    let app = Router::new().route("/get_weather/{city}", get(get_weather));

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{PORT}"))
        .await
        .expect(&format!("Failed to bind port {}", PORT));

    println!("Server starting on port {}", PORT);
    axum::serve(listener, app).await.expect("Server failed");
}
