use crate::open_meteo_forecast_structs::OpenMeteoArchive;
use crate::unified_response_structs::DailyData;
use crate::utils::moon_for_date;
use crate::utils::weather_description;
use chrono::Duration;

use chrono::{Local, NaiveDate};

pub async fn fetch_yesterday(lat: f64, lon: f64) -> Result<DailyData, String> {
    let yesterday_date: NaiveDate = (Local::now() - Duration::days(1)).date_naive();
    let date_str: String = yesterday_date.format("%Y-%m-%d").to_string();
    let url: String = format!(
        "https://archive-api.open-meteo.com/v1/archive?latitude={:.4}&longitude={:.4}&start_date={}&end_date={}&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,weather_code&timezone=auto",
        lat, lon, date_str, date_str
    );
    let response: reqwest::Response = reqwest::get(&url)
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
    let (moon_phase_name, moon_illumination) = moon_for_date(&date_str).await;
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
