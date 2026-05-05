use crate::helpers::convert_temp;
use crate::helpers::convert_wind;
use crate::settings::TempUnit;
use crate::settings::WindUnit;
use crate::types::WeatherResponse;

#[cfg(target_arch = "wasm32")]
use gloo_net::http::Request;

pub const API_URL: &str = "https://functions.yandexcloud.net/d4ejjs1qt2b6v625aknb?city";
pub const SETTINGS_KEY: &str = "weather_settings";

pub async fn fetch_weather(
    city: &str,
    temp_unit: TempUnit,
    wind_unit: WindUnit,
) -> Result<WeatherResponse, String> {
    let url = format!("{}={}", API_URL, urlencoding::encode(city));

    #[cfg(target_arch = "wasm32")]
    {
        let resp = Request::get(&url)
            .send()
            .await
            .map_err(|e| format!("Network error: {e}"))?;
        if !resp.ok() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("API error {}: {}", status, text));
        }
        let text = resp
            .text()
            .await
            .map_err(|e| format!("Failed to get text: {e}"))?;

        let mut data: WeatherResponse = serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse weather data: {e}"))?;

        data.current.temperature = convert_temp(data.current.temperature, &temp_unit);
        data.current.wind_speed = convert_wind(data.current.wind_speed, &wind_unit);
        data.yesterday.temperature_max = convert_temp(data.yesterday.temperature_max, &temp_unit);
        data.yesterday.temperature_min = convert_temp(data.yesterday.temperature_min, &temp_unit);
        data.yesterday.wind_speed_max = convert_wind(data.yesterday.wind_speed_max, &wind_unit);
        for h in &mut data.hourly {
            h.temperature = convert_temp(h.temperature, &temp_unit);
            h.wind_speed = convert_wind(h.wind_speed, &wind_unit);
        }
        for f in &mut data.forecast {
            f.temperature_max = convert_temp(f.temperature_max, &temp_unit);
            f.temperature_min = convert_temp(f.temperature_min, &temp_unit);
            f.wind_speed_max = convert_wind(f.wind_speed_max, &wind_unit);
        }
        Ok(data)
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("API error {}: {}", status, text));
        }

        let json_text = response
            .text()
            .await
            .map_err(|e| format!("Failed to get response text: {}", e))?;

        let mut data: WeatherResponse =
            serde_json::from_str(&json_text).map_err(|e| format!("Failed to parse JSON: {}", e))?;

        // Apply unit conversions
        data.current.temperature = convert_temp(data.current.temperature, &temp_unit);
        data.current.wind_speed = convert_wind(data.current.wind_speed, &wind_unit);
        data.yesterday.temperature_max = convert_temp(data.yesterday.temperature_max, &temp_unit);
        data.yesterday.temperature_min = convert_temp(data.yesterday.temperature_min, &temp_unit);
        data.yesterday.wind_speed_max = convert_wind(data.yesterday.wind_speed_max, &wind_unit);
        for h in &mut data.hourly {
            h.temperature = convert_temp(h.temperature, &temp_unit);
            h.wind_speed = convert_wind(h.wind_speed, &wind_unit);
        }
        for f in &mut data.forecast {
            f.temperature_max = convert_temp(f.temperature_max, &temp_unit);
            f.temperature_min = convert_temp(f.temperature_min, &temp_unit);
            f.wind_speed_max = convert_wind(f.wind_speed_max, &wind_unit);
        }

        Ok(data)
    }
}
