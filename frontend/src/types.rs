use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CurrentData {
    pub temperature: f64,
    pub wind_speed: f64,
    pub condition: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DailyData {
    pub date: String,
    pub temperature_max: f64,
    pub temperature_min: f64,
    pub wind_speed_max: f64,
    pub condition: String,
    pub sunrise: Option<String>,
    pub sunset: Option<String>,
    pub moon_phase_name: Option<String>,
    pub moon_illumination: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HourlyData {
    pub date: String, // NEW: "2026-05-02"
    pub time: String, // "14:00"
    pub temperature: f64,
    pub wind_speed: f64,
    pub condition: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WeatherResponse {
    pub city: String,
    pub current: CurrentData,
    pub hourly: Vec<HourlyData>,
    pub yesterday: DailyData,
    pub forecast: Vec<DailyData>,
}
