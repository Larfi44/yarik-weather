use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CurrentData {
    pub temperature: f64,
    pub wind_speed: f64,
    pub condition: String,
    pub pressure: f64,
    pub sea_temperature: Option<f64>,
    pub uv_index: f64,
    pub precipitation_probability: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HourlyData {
    pub date: String,
    pub time: String,
    pub temperature: f64,
    pub wind_speed: f64,
    pub condition: String,
    pub pressure: f64,
    pub sea_temperature: Option<f64>,
    pub uv_index: f64,
    pub precipitation_probability: f64, // this hour’s rain chance
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
    pub uv_index_max: f64,
    pub precipitation_probability_max: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WeatherResponse {
    pub city: String,
    pub current: CurrentData,
    pub hourly: Vec<HourlyData>,
    pub yesterday: DailyData,
    pub forecast: Vec<DailyData>,
    pub local_yesterday: String,
    pub local_today: String,
}
