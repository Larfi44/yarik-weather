use axum::{
    Router,
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::get,
};
use chrono::NaiveDate;
use chrono_tz::Tz;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc};

// ---------- Coastal city lists ----------
const COASTAL_CITIES_EN: &[&str] = &[
    // Russia
    "Sochi",
    "Vladivostok",
    "Kaliningrad",
    "Murmansk",
    "Arkhangelsk",
    "Saint Petersburg",
    "St. Petersburg",
    "Novorossiysk",
    "Anapa",
    "Gelendzhik",
    "Tuapse",
    "Nakhodka",
    "Magadan",
    "Petropavlovsk-Kamchatsky",
    "Yuzhno-Sakhalinsk",
    "Korsakov",
    "Kholmsk",
    "Vanino",
    "Sovetskaya Gavan",
    "Dudinka",
    "Tiksi",
    "Pevek",
    "Anadyr",
    "Provideniya",
    "Vysotsk",
    "Primorsk",
    "Baltiysk",
    "Svetly",
    "Ladushkin",
    "Mamonovo",
    "Pionersky",
    "Zelenogradsk",
    "Svetlogorsk",
    "Yantarny",
    "Kandalaksha",
    "Severomorsk",
    "Polyarny",
    "Gadzhiyevo",
    "Zaozersk",
    "Vidyayevo",
    "Ostrovnoy",
    "Naryan-Mar",
    "Amderma",
    "Dikson",
    "Khatanga",
    "Chokurdakh",
    "Nizhneyansk",
    "Ambarchik",
    "Egvekinot",
    "Lavrentiya",
    "Uelen",
    // Crimea
    "Sevastopol",
    "Yalta",
    "Alushta",
    "Sudak",
    "Feodosia",
    "Kerch",
    "Yevpatoria",
    "Saki",
    "Chernomorskoe",
    "Balaklava",
    "Foros",
    "Gurzuf",
    "Partenit",
    "Koktebel",
    "Ordzhonikidze",
    // World
    "Miami",
    "Los Angeles",
    "San Francisco",
    "Rio de Janeiro",
    "Sydney",
    "Melbourne",
    "Cape Town",
    "Barcelona",
    "Valencia",
    "Malaga",
    "Lisbon",
    "Porto",
    "Rome",
    "Naples",
    "Athens",
    "Istanbul",
    "Antalya",
    "Dubai",
    "Mumbai",
    "Chennai",
    "Bangkok",
    "Hong Kong",
    "Tokyo",
    "Osaka",
    "Busan",
    "Vancouver",
    "Halifax",
    "Reykjavik",
    "Copenhagen",
    "Stockholm",
    "Helsinki",
    "Oslo",
    "London",
    "Amsterdam",
    "Jakarta",
    "Manila",
    "Lima",
    "Santiago",
    "Buenos Aires",
    "Montevideo",
    "Perth",
    "Wellington",
    "Cancun",
    "Nassau",
    "Honolulu",
    "Acapulco",
    "Dar es Salaam",
    "Mombasa",
    "Casablanca",
    "Tel Aviv",
];

const COASTAL_CITIES_RU: &[&str] = &[
    "Сочи",
    "Владивосток",
    "Калининград",
    "Мурманск",
    "Архангельск",
    "Санкт-Петербург",
    "Санкт-Петербург",
    "Новороссийск",
    "Анапа",
    "Геленджик",
    "Туапсе",
    "Находка",
    "Магадан",
    "Петропавловск-Камчатский",
    "Южно-Сахалинск",
    "Корсаков",
    "Холмск",
    "Ванино",
    "Советская Гавань",
    "Дудинка",
    "Тикси",
    "Певек",
    "Анадырь",
    "Провидения",
    "Высоцк",
    "Приморск",
    "Балтийск",
    "Светлый",
    "Ладушкин",
    "Мамоново",
    "Пионерский",
    "Зеленоградск",
    "Светлогорск",
    "Янтарный",
    "Кандалакша",
    "Североморск",
    "Полярный",
    "Гаджиево",
    "Заозёрск",
    "Видяево",
    "Островной",
    "Нарьян-Мар",
    "Амдерма",
    "Диксон",
    "Хатанга",
    "Чокурдах",
    "Нижнеянск",
    "Амбарчик",
    "Эгвекинот",
    "Лаврентия",
    "Уэлен",
    "Севастополь",
    "Ялта",
    "Алушта",
    "Судак",
    "Феодосия",
    "Керчь",
    "Евпатория",
    "Саки",
    "Черноморское",
    "Балаклава",
    "Форос",
    "Гурзуф",
    "Партенит",
    "Коктебель",
    "Орджоникидзе",
    "Майами",
    "Лос-Анджелес",
    "Сан-Франциско",
    "Рио-де-Жанейро",
    "Сидней",
    "Мельбурн",
    "Кейптаун",
    "Барселона",
    "Валенсия",
    "Малага",
    "Лиссабон",
    "Порту",
    "Рим",
    "Неаполь",
    "Афины",
    "Стамбул",
    "Анталья",
    "Дубай",
    "Мумбаи",
    "Ченнаи",
    "Бангкок",
    "Гонконг",
    "Токио",
    "Осака",
    "Пусан",
    "Ванкувер",
    "Галифакс",
    "Рейкьявик",
    "Копенгаген",
    "Стокгольм",
    "Хельсинки",
    "Осло",
    "Лондон",
    "Амстердам",
    "Джакарта",
    "Манила",
    "Лима",
    "Сантьяго",
    "Буэнос-Айрес",
    "Монтевидео",
    "Перт",
    "Веллингтон",
    "Канкун",
    "Нассау",
    "Гонолулу",
    "Акапулько",
    "Дар-эс-Салам",
    "Момбаса",
    "Касабланка",
    "Тель-Авив",
];

fn is_coastal_city(city: &str) -> bool {
    COASTAL_CITIES_EN
        .iter()
        .any(|c| c.eq_ignore_ascii_case(city))
        || COASTAL_CITIES_RU
            .iter()
            .any(|c| c.to_lowercase() == city.to_lowercase())
}

// ---------- Structs matching the frontend ----------

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
struct CurrentData {
    temperature: f64,
    wind_speed: f64,
    condition: String,
    pressure: f64,
    sea_temperature: Option<f64>,
    uv_index: f64,
    precipitation_probability: f64,
    #[serde(skip)]
    latitude: Option<f64>, // stored for AI, not serialized
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
struct HourlyData {
    date: String,
    time: String,
    temperature: f64,
    wind_speed: f64,
    condition: String,
    pressure: f64,
    sea_temperature: Option<f64>,
    uv_index: f64,
    precipitation_probability: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
struct DailyData {
    date: String,
    temperature_max: f64,
    temperature_min: f64,
    wind_speed_max: f64,
    condition: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    sunrise: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sunset: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    moon_phase_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    moon_illumination: Option<f64>,
    uv_index_max: f64,
    precipitation_probability_max: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
struct WeatherResponse {
    city: String,
    current: CurrentData,
    hourly: Vec<HourlyData>,
    yesterday: DailyData,
    forecast: Vec<DailyData>,
    local_today: String,
    local_yesterday: String,
}

// ---------- Open‑Meteo API structures ----------

#[derive(Debug, Deserialize)]
struct GeocodingResponse {
    results: Option<Vec<GeocodingResult>>,
}

#[derive(Debug, Deserialize)]
struct GeocodingResult {
    latitude: f64,
    longitude: f64,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoCurrent {
    temperature_2m: f64,
    wind_speed_10m: f64,
    weather_code: i64,
    surface_pressure: f64,
    #[serde(default)]
    sea_surface_temperature: Option<f64>,
    #[serde(default)]
    uv_index: f64,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoHourly {
    time: Vec<String>,
    temperature_2m: Vec<f64>,
    wind_speed_10m: Vec<f64>,
    weather_code: Vec<i64>,
    surface_pressure: Vec<f64>,
    #[serde(default)]
    sea_surface_temperature: Option<Vec<Option<f64>>>,
    #[serde(default)]
    uv_index: Vec<f64>,
    #[serde(default)]
    precipitation_probability: Option<Vec<f64>>,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoDaily {
    time: Vec<String>,
    temperature_2m_max: Vec<f64>,
    temperature_2m_min: Vec<f64>,
    wind_speed_10m_max: Vec<f64>,
    weather_code: Vec<i64>,
    sunrise: Option<Vec<String>>,
    sunset: Option<Vec<String>>,
    #[serde(default)]
    uv_index_max: Vec<f64>,
    #[serde(default)]
    precipitation_probability_max: Option<Vec<f64>>,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoForecast {
    current: OpenMeteoCurrent,
    hourly: OpenMeteoHourly,
    daily: OpenMeteoDaily,
    timezone: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoArchive {
    daily: OpenMeteoArchiveDaily,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoArchiveDaily {
    time: Vec<String>,
    temperature_2m_max: Vec<f64>,
    temperature_2m_min: Vec<f64>,
    wind_speed_10m_max: Vec<f64>,
    weather_code: Vec<i64>,
}

// ---------- Helpers ----------

fn local_today_date(iana_tz: &str) -> (String, String) {
    let tz: Tz = iana_tz.parse().unwrap_or(chrono_tz::UTC);
    let local_now = chrono::Utc::now().with_timezone(&tz);
    let today = local_now.format("%Y-%m-%d").to_string();
    let yesterday = (local_now - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();
    (yesterday, today)
}

fn weather_description(code: i64) -> String {
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
    .to_string()
}

fn moon_phase_for_date(date: NaiveDate) -> (String, f64) {
    let synodic_month = 29.53058867;
    let reference = NaiveDate::from_ymd_opt(2000, 1, 6)
        .unwrap()
        .and_hms_opt(0, 0, 0)
        .unwrap();
    let target = date.and_hms_opt(0, 0, 0).unwrap();
    let days_since_reference = (target - reference).num_hours() as f64 / 24.0;
    let mut age = days_since_reference % synodic_month;
    if age < 0.0 {
        age += synodic_month;
    }
    let illumination = ((1.0 - (2.0 * std::f64::consts::PI * age / synodic_month).cos()) / 2.0
        * 100.0)
        .clamp(0.0, 100.0);
    let phase_name = match age {
        a if a < 1.84566 => "New Moon",
        a if a < 5.53699 => "Waxing Crescent",
        a if a < 9.22831 => "First Quarter",
        a if a < 12.91963 => "Waxing Gibbous",
        a if a < 16.61096 => "Full Moon",
        a if a < 20.30228 => "Waning Gibbous",
        a if a < 23.99361 => "Last Quarter",
        _ => "Waning Crescent",
    };
    (phase_name.to_string(), illumination)
}

async fn fetch_json<T: serde::de::DeserializeOwned>(
    client: &Client,
    url: &str,
) -> anyhow::Result<T> {
    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(anyhow::anyhow!("API error: {}", resp.status()));
    }
    Ok(resp.json().await?)
}

async fn get_coordinates(client: &Client, city: &str) -> anyhow::Result<(f64, f64)> {
    let encoded = urlencoding::encode(city);
    let has_cyrillic = city
        .chars()
        .any(|c| c as u32 > 0x0400 && c as u32 <= 0x04FF);
    let lang = if has_cyrillic { "ru" } else { "en" };
    let api_url = format!(
        "https://geocoding-api.open-meteo.com/v1/search?name={}&count=1&language={}&format=json",
        encoded, lang
    );
    let result: GeocodingResponse = fetch_json(client, &api_url).await?;
    let results = result.results.unwrap_or_default();
    if results.is_empty() {
        return Err(anyhow::anyhow!("city '{}' not found", city));
    }
    Ok((results[0].latitude, results[0].longitude))
}

async fn fetch_forecast(client: &Client, lat: f64, lon: f64, city: &str) -> anyhow::Result<OpenMeteoForecast> {
    let coastal = is_coastal_city(city);
    let sea_current = if coastal { "sea_surface_temperature," } else { "" };
    let sea_hourly = if coastal { "sea_surface_temperature," } else { "" };
    let url: String = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={:.4}&longitude={:.4}&\
    current=temperature_2m,wind_speed_10m,weather_code,surface_pressure,{}uv_index&\
    hourly=temperature_2m,wind_speed_10m,weather_code,surface_pressure,{}uv_index,precipitation_probability&\
    daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,weather_code,sunrise,sunset,uv_index_max,precipitation_probability_max&\
    timezone=auto&forecast_days=8",
        lat, lon, sea_current, sea_hourly
    );
    fetch_json(client, &url).await
}

async fn fetch_yesterday(client: &Client, lat: f64, lon: f64) -> anyhow::Result<DailyData> {
    let yesterday = chrono::Utc::now().date_naive() - chrono::Duration::days(1);
    let date_str = yesterday.format("%Y-%m-%d").to_string();
    let url = format!(
        "https://archive-api.open-meteo.com/v1/archive?latitude={:.4}&longitude={:.4}&start_date={}&end_date={}&\
        daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,weather_code&timezone=auto",
        lat, lon, date_str, date_str
    );

    // Custom client with longer timeout + retry on any 5xx
    let archive_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let mut attempt = 0;
    let archive = loop {
        attempt += 1;
        match archive_client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                break resp.json::<OpenMeteoArchive>().await?;
            }
            Ok(resp) if resp.status().is_server_error() && attempt < 2 => {
                // retry once on any 5xx (includes 504)
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                continue;
            }
            Ok(resp) => {
                return Err(anyhow::anyhow!("Archive API error: {}", resp.status()));
            }
            Err(e) => {
                if attempt < 2 {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    continue;
                }
                return Err(e.into());
            }
        }
    };

    if archive.daily.time.is_empty() {
        return Err(anyhow::anyhow!("no historical data"));
    }

    let (moon_name, moon_illum) = moon_phase_for_date(yesterday);
    Ok(DailyData {
        date: archive.daily.time[0].clone(),
        temperature_max: archive.daily.temperature_2m_max[0],
        temperature_min: archive.daily.temperature_2m_min[0],
        wind_speed_max: archive.daily.wind_speed_10m_max[0],
        condition: weather_description(archive.daily.weather_code[0]),
        sunrise: None,
        sunset: None,
        moon_phase_name: Some(moon_name),
        moon_illumination: Some(moon_illum),
        uv_index_max: 0.0,
        precipitation_probability_max: 0.0,
    })
}

async fn get_weather_data(client: &Client, city: &str) -> anyhow::Result<WeatherResponse> {
    let (lat, lon) = get_coordinates(client, city).await?;
    let latitude = lat; // store for AI
    let city_owned = city.to_string();
    let (forecast_res, yesterday_res) = tokio::join!(
        fetch_forecast(client, lat, lon, &city_owned),
        fetch_yesterday(client, lat, lon)
    );
    let forecast = forecast_res?;
    let iana_tz = forecast
        .timezone
        .clone()
        .unwrap_or_else(|| "UTC".to_string());
    let (yesterday_str, today_str) = local_today_date(&iana_tz);
    let yesterday = yesterday_res?;
    if forecast.daily.time.is_empty() {
        return Err(anyhow::anyhow!("no daily forecast"));
    }
    if forecast.hourly.time.is_empty() {
        return Err(anyhow::anyhow!("no hourly forecast"));
    }

    let today_precip = forecast
        .daily
        .precipitation_probability_max
        .as_ref()
        .and_then(|v| v.first().copied())
        .unwrap_or(0.0);
    let current = CurrentData {
        temperature: forecast.current.temperature_2m,
        wind_speed: forecast.current.wind_speed_10m,
        condition: weather_description(forecast.current.weather_code),
        pressure: forecast.current.surface_pressure,
        sea_temperature: forecast.current.sea_surface_temperature,
        uv_index: forecast.current.uv_index,
        precipitation_probability: today_precip,
        latitude: Some(latitude),
    };

    let mut hourly = Vec::new();
    if !forecast.hourly.time.is_empty() {
        let max_days = 9;
        let max_entries = max_days * 24;
        let mut added_dates = std::collections::HashSet::new();
        let mut count = 0;

        for (i, time_str) in forecast.hourly.time.iter().enumerate() {
            if count >= max_entries {
                break;
            }

            let parts: Vec<&str> = time_str.split('T').collect();
            let date_only = parts[0];

            // Keep only yesterday (local), today (local) and future dates
            if date_only < yesterday_str.as_str() {
                continue;
            }
            if date_only > today_str.as_str() {
                // future day – okay
            } else if date_only == today_str.as_str() || date_only == yesterday_str.as_str() {
                // always include full today and full yesterday
            } else {
                continue;
            }

            // Limit to 6 distinct dates
            if added_dates.len() >= max_days && !added_dates.contains(date_only) {
                continue;
            }
            added_dates.insert(date_only.to_string());

            let time_only = parts.get(1).map(|t| &t[..5]).unwrap_or("");

            let sea_temp = forecast
                .hourly
                .sea_surface_temperature
                .as_ref()
                .and_then(|v| v.get(i).copied().flatten());

            let precip_prob = forecast
                .hourly
                .precipitation_probability
                .as_ref()
                .and_then(|v| v.get(i).copied())
                .unwrap_or(0.0);

            hourly.push(HourlyData {
                date: date_only.to_string(),
                time: time_only.to_string(),
                temperature: forecast.hourly.temperature_2m[i],
                wind_speed: forecast.hourly.wind_speed_10m[i],
                condition: weather_description(forecast.hourly.weather_code[i]),
                pressure: forecast.hourly.surface_pressure[i],
                sea_temperature: sea_temp,
                uv_index: forecast.hourly.uv_index.get(i).copied().unwrap_or(0.0),
                precipitation_probability: precip_prob,
            });
            count += 1;
        }
    }

    let mut forecast_days = Vec::new();
    for i in 0..forecast.daily.time.len() {
        let parsed_date = NaiveDate::parse_from_str(&forecast.daily.time[i], "%Y-%m-%d")
            .unwrap_or_else(|_| NaiveDate::from_ymd_opt(1970, 1, 1).unwrap());
        let (moon_name, moon_illum) = moon_phase_for_date(parsed_date);
        let sunrise = forecast
            .daily
            .sunrise
            .as_ref()
            .and_then(|v| v.get(i).cloned());
        let sunset = forecast
            .daily
            .sunset
            .as_ref()
            .and_then(|v| v.get(i).cloned());
        let precip_max = forecast
            .daily
            .precipitation_probability_max
            .as_ref()
            .and_then(|v| v.get(i).copied())
            .unwrap_or(0.0);
        forecast_days.push(DailyData {
            date: forecast.daily.time[i].clone(),
            temperature_max: forecast.daily.temperature_2m_max[i],
            temperature_min: forecast.daily.temperature_2m_min[i],
            wind_speed_max: forecast.daily.wind_speed_10m_max[i],
            condition: weather_description(forecast.daily.weather_code[i]),
            sunrise,
            sunset,
            moon_phase_name: Some(moon_name),
            moon_illumination: Some(moon_illum),
            uv_index_max: forecast.daily.uv_index_max.get(i).copied().unwrap_or(0.0),
            precipitation_probability_max: precip_max,
        });
    }

    Ok(WeatherResponse {
        city: city.to_string(),
        current,
        hourly,
        yesterday,
        forecast: forecast_days,
        local_today: today_str,
        local_yesterday: yesterday_str,
    })
}

// ---------- AppState ----------
struct AppState {
    client: Arc<Client>,
}

// ---------- Handlers ----------
async fn weather_handler(
    Query(params): Query<HashMap<String, String>>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<WeatherResponse>, AppError> {
    let city = params
        .get("city")
        .ok_or_else(|| AppError::BadRequest("Missing city".into()))?;
    let weather = get_weather_data(&state.client, city).await?;
    Ok(Json(weather))
}

// ---------- Error types ----------
enum AppError {
    BadRequest(String),
    Internal(anyhow::Error),
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        AppError::Internal(err.into())
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::Internal(err)
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match self {
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            AppError::Internal(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
        };
        (status, Json(serde_json::json!({"error": message}))).into_response()
    }
}

// ---------- Main ----------
#[tokio::main]
async fn main() {
    let client = Client::new();
    let app_state = Arc::new(AppState {
        client: Arc::new(client),
    });

    let port = std::env::var("PORT").unwrap_or_else(|_| "8081".to_string());
    let bind_addr = format!("0.0.0.0:{}", port);

    let cors = tower_http::cors::CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    let app = Router::new()
        .route("/", get(weather_handler))
        .layer(cors)
        .layer(tower_http::catch_panic::CatchPanicLayer::custom(
            |err: Box<dyn std::any::Any + Send + 'static>| {
                let message = if let Some(s) = err.downcast_ref::<String>() {
                    s.clone()
                } else if let Some(s) = err.downcast_ref::<&str>() {
                    s.to_string()
                } else {
                    "Unknown panic".to_string()
                };
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": format!("panic: {}", message)})),
                )
                    .into_response()
            },
        ))
        .with_state(app_state);

    println!("Server binding to {}", bind_addr);
    let listener = tokio::net::TcpListener::bind(&bind_addr).await.unwrap();
    println!("Server running on http://{}", bind_addr);
    axum::serve(listener, app).await.unwrap();
}
