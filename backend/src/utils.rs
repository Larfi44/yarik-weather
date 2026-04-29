use chrono::{Local, NaiveDate};
use std::f64::consts::PI;

pub fn weather_description(code: u8) -> &'static str {
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

pub fn moon_phase_for_date(date: NaiveDate) -> (String, f64) {
    const SYNODIC_MONTH: f64 = 29.530_588_67;
    let reference_new_moon: NaiveDate = NaiveDate::from_ymd_opt(2000, 1, 6).unwrap();
    let days_since_reference: f64 = (date - reference_new_moon).num_days() as f64;
    let mut age: f64 = days_since_reference % SYNODIC_MONTH;
    if age < 0.0 {
        age += SYNODIC_MONTH;
    }
    let illumination: f64 = ((1.0 - (2.0 * PI * age / SYNODIC_MONTH).cos()) / 2.0) * 100.0;
    let phase_name: &str = match age {
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

pub async fn moon_for_date(date_str: &str) -> (String, f64) {
    let parsed = NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
        .unwrap_or_else(|_| Local::now().date_naive());
    moon_phase_for_date(parsed)
}
