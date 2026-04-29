use crate::forecast::fetch_forecast;
use crate::geocoding::get_coordinates;
use crate::unified_response_structs::CurrentData;
use crate::unified_response_structs::DailyData;
use crate::unified_response_structs::HourlyData;
use crate::unified_response_structs::WeatherResponse;
use crate::utils::moon_for_date;
use crate::weather_description;
use crate::yesterday::fetch_yesterday;

use axum::{Json, extract::Path, http::StatusCode, response::IntoResponse};

pub async fn get_weather(Path(city): Path<String>) -> impl IntoResponse {
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

    // Hourly data for today (first 24 entries)
    let hourly: Vec<HourlyData> = forecast
        .hourly
        .time
        .iter()
        .enumerate()
        .take(24)
        .map(|(i, time)| {
            let time_str = time
                .split('T')
                .nth(1)
                .unwrap_or(time)
                .chars()
                .take(5)
                .collect::<String>();
            HourlyData {
                time: time_str,
                temperature: forecast.hourly.temperature_2m[i],
                wind_speed: forecast.hourly.wind_speed_10m[i],
                condition: weather_description(forecast.hourly.weather_code[i]).to_string(),
            }
        })
        .collect();

    // Daily forecast with moon
    let mut forecast_days = Vec::with_capacity(forecast.daily.time.len());
    for (i, date) in forecast.daily.time.iter().enumerate() {
        let (moon_phase_name, moon_illumination) = moon_for_date(date).await;
        forecast_days.push(DailyData {
            date: date.clone(),
            temperature_max: forecast.daily.temperature_2m_max[i],
            temperature_min: forecast.daily.temperature_2m_min[i],
            wind_speed_max: forecast.daily.wind_speed_10m_max[i],
            condition: weather_description(forecast.daily.weather_code[i]).to_string(),
            sunrise: forecast.daily.sunrise.get(i).cloned(),
            sunset: forecast.daily.sunset.get(i).cloned(),
            moon_phase_name: Some(moon_phase_name),
            moon_illumination: Some(moon_illumination),
        });
    }

    let response = WeatherResponse {
        city,
        current,
        hourly,
        yesterday,
        forecast: forecast_days,
    };

    (StatusCode::OK, Json(response)).into_response()
}
