use crate::settings::TempUnit;
use crate::settings::WindUnit;
use crate::types::WeatherResponse;
#[cfg(target_arch = "wasm32")]
use gloo_net::http::Request;

pub const API_URL: &str = "https://bba456glbns2mjqupmls.containers.yandexcloud.net?city";

#[cfg(target_os = "android")]
fn log_error(msg: &str) {
    let base = std::env::var("EXTERNAL_STORAGE").unwrap_or_else(|_| "/sdcard".to_string());
    let path = std::path::PathBuf::from(format!(
        "{}/Android/data/com.YarikStudio.YarikWeather/files/error_log.txt",
        base
    ));
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, msg);
}

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

        let data: WeatherResponse = serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse weather data: {e}"))?;

        Ok(data)
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        #[cfg(target_os = "android")]
        log_error(&format!("Starting request to {url}"));

        let client = reqwest::Client::new();
        let response = client.get(&url).send().await.map_err(|e| {
            let msg = format!("Request failed: {e}");
            #[cfg(target_os = "android")]
            log_error(&msg);
            msg
        })?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            let msg = format!("API error {status}: {text}");
            #[cfg(target_os = "android")]
            log_error(&msg);
            return Err(msg);
        }

        let json_text = response.text().await.map_err(|e| {
            let msg = format!("Failed to get response text: {e}");
            #[cfg(target_os = "android")]
            log_error(&msg);
            msg
        })?;

        #[cfg(target_os = "android")]
        log_error(&format!("Response received: {json_text}"));

        let data: WeatherResponse =
            serde_json::from_str(&json_text).map_err(|e| format!("Failed to parse JSON: {e}"))?;

        Ok(data)
    }
}
