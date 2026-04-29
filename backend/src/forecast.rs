use crate::open_meteo_forecast_structs::OpenMeteoForecast;

pub async fn fetch_forecast(lat: f64, lon: f64) -> Result<OpenMeteoForecast, String> {
    let url: String = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={:.4}&longitude={:.4}&current=temperature_2m,wind_speed_10m,weather_code&hourly=temperature_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,weather_code,sunrise,sunset&timezone=auto",
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
