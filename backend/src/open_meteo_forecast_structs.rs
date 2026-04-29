use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct OpenMeteoForecast {
    pub current: CurrentWeather,
    pub hourly: HourlyForecast,
    pub daily: DailyForecast,
}

#[derive(Debug, Deserialize)]
pub struct CurrentWeather {
    pub temperature_2m: f64,
    pub wind_speed_10m: f64,
    pub weather_code: u8,
}

#[derive(Debug, Deserialize)]
pub struct HourlyForecast {
    pub time: Vec<String>,
    pub temperature_2m: Vec<f64>,
    pub wind_speed_10m: Vec<f64>,
    pub weather_code: Vec<u8>,
}

#[derive(Debug, Deserialize)]
pub struct DailyForecast {
    pub time: Vec<String>,
    pub temperature_2m_max: Vec<f64>,
    pub temperature_2m_min: Vec<f64>,
    pub wind_speed_10m_max: Vec<f64>,
    pub weather_code: Vec<u8>,
    pub sunrise: Vec<String>,
    pub sunset: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct OpenMeteoArchive {
    pub daily: ArchiveDaily,
}

#[derive(Debug, Deserialize)]
pub struct ArchiveDaily {
    pub time: Vec<String>,
    pub temperature_2m_max: Vec<f64>,
    pub temperature_2m_min: Vec<f64>,
    pub wind_speed_10m_max: Vec<f64>,
    pub weather_code: Vec<u8>,
}
