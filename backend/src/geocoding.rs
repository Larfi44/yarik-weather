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

    // Detect if the input contains Cyrillic characters
    let has_cyrillic = city.chars().any(|c| matches!(c, '\u{0400}'..='\u{04FF}'));
    let lang = if has_cyrillic { "ru" } else { "en" };

    let url = format!(
        "https://geocoding-api.open-meteo.com/v1/search?name={}&count=1&language={}&format=json",
        encoded, lang
    );

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Geocoding request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Geocoding API error: {}", response.status()));
    }

    // Read the raw text so we can show it on parse errors
    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response text: {}", e))?;

    let data: GeocodingResponse = serde_json::from_str(&text).map_err(|e| {
        format!(
            "Failed to parse geocoding JSON: {}. Raw response: {}",
            e,
            &text[..text.len().min(200)]
        )
    })?;

    let first = data.results.first().ok_or_else(|| {
        format!(
            "City '{}' not found. Response: {}",
            city,
            &text[..text.len().min(200)]
        )
    })?;

    Ok((first.latitude, first.longitude))
}
