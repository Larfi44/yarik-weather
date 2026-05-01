use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct WeatherResponse {
    pub city: String,
    pub current: CurrentData,
    pub hourly: Vec<HourlyData>,
    pub yesterday: DailyData,
    pub forecast: Vec<DailyData>,
}

#[derive(Debug, Serialize)]
pub struct CurrentData {
    pub temperature: f64,
    pub wind_speed: f64,
    pub condition: String,
}

#[derive(Debug, Serialize)]
pub struct HourlyData {
    pub date: String, // NEW: "YYYY-MM-DD"
    pub time: String, // "HH:MM"
    pub temperature: f64,
    pub wind_speed: f64,
    pub condition: String,
}

#[derive(Debug, Serialize)]
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
