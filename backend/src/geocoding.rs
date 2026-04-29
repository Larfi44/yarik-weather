use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct GeocodingResponse {
    results: Vec<GeocodingResult>,
}

#[derive(Debug, Deserialize)]
pub struct GeocodingResult {
    latitude: f64,
    longitude: f64,
}

pub async fn get_coordinates(city: &str) -> Result<(f64, f64), String> {
    let encoded = urlencoding::encode(city);
    let url: String = format!(
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
