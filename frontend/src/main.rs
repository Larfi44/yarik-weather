use dioxus::html::input_data::keyboard_types::Key;
use dioxus::prelude::*;
use gloo_net::http::Request;
use gloo_storage::{LocalStorage, Storage};
use serde::{Deserialize, Serialize};

static CSS: Asset = asset!("/assets/main.css");
const FAVICON: Asset = asset!("/assets/favicon.svg");
const ANDROID_ICON: Asset = asset!("/assets/android.png");
const APPLE_LIGHT: Asset = asset!("/assets/apple-light.svg");
const APPLE_DARK: Asset = asset!("/assets/apple-dark.svg");
const LINUX_ICON: Asset = asset!("/assets/linux.png");
const WINDOWS_ICON: Asset = asset!("/assets/windows.svg");

const API_URL: &str = "http://127.0.0.1:3000/get_weather";

// ---------- Types ----------
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WeatherResponse {
    pub city: String,
    pub current: CurrentData,
    pub yesterday: DailyData,
    pub forecast: Vec<DailyData>,
}

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

// ---------- Settings ----------
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TempUnit {
    Celsius,
    Fahrenheit,
    Kelvin,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Theme {
    Auto,
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum WindUnit {
    Mps,
    Kmph,
    Mph,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Language {
    English,
    Russian,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UserSettings {
    pub temp_unit: TempUnit,
    pub wind_unit: WindUnit,
    pub language: Language,
    pub default_city: String,
    pub theme: Theme,
    pub first_time: bool,
}

const SETTINGS_KEY: &str = "weather_settings";

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            temp_unit: TempUnit::Celsius,
            wind_unit: WindUnit::Mps,
            language: Language::English,
            default_city: String::new(),
            theme: Theme::Auto,
            first_time: true,
        }
    }
}

fn apple_icon(theme: Theme) -> Asset {
    match theme {
        Theme::Light => APPLE_DARK,
        Theme::Dark => APPLE_LIGHT,
        Theme::Auto => APPLE_LIGHT,
    }
}

fn get_settings() -> UserSettings {
    LocalStorage::get(SETTINGS_KEY).unwrap_or_default()
}

fn save_settings(settings: &UserSettings) {
    let _ = LocalStorage::set(SETTINGS_KEY, settings);
}

fn cycle_theme(theme: Theme) -> Theme {
    match theme {
        Theme::Auto => Theme::Light,
        Theme::Light => Theme::Dark,
        Theme::Dark => Theme::Auto,
    }
}

fn choice_btn_class(active: bool) -> &'static str {
    if active {
        "choice-btn active"
    } else {
        "choice-btn"
    }
}

fn theme_icon(theme: Theme) -> &'static str {
    match theme {
        Theme::Auto => "🌓",
        Theme::Light => "☀️",
        Theme::Dark => "🌙",
    }
}

fn language_value(lang: &Language) -> &'static str {
    match lang {
        Language::English => "English",
        Language::Russian => "Russian",
    }
}

fn resolve_theme(theme: Theme) -> Theme {
    match theme {
        Theme::Auto => Theme::Light,
        _ => theme,
    }
}

fn temp_unit_value(unit: &TempUnit) -> &'static str {
    match unit {
        TempUnit::Celsius => "Celsius",
        TempUnit::Fahrenheit => "Fahrenheit",
        TempUnit::Kelvin => "Kelvin",
    }
}

fn wind_unit_value(unit: &WindUnit) -> &'static str {
    match unit {
        WindUnit::Mps => "m/s",
        WindUnit::Kmph => "km/h",
        WindUnit::Mph => "mph",
    }
}

fn theme_label(theme: &Theme, lang: &Language) -> &'static str {
    match (theme, lang) {
        (Theme::Auto, Language::English) => "Auto",
        (Theme::Light, Language::English) => "Light",
        (Theme::Dark, Language::English) => "Dark",
        (Theme::Auto, Language::Russian) => "Авто",
        (Theme::Light, Language::Russian) => "Светлая",
        (Theme::Dark, Language::Russian) => "Тёмная",
    }
}

// ---------- Helpers ----------
fn convert_temp(celsius: f64, unit: &TempUnit) -> f64 {
    match unit {
        TempUnit::Celsius => celsius,
        TempUnit::Fahrenheit => celsius * 9.0 / 5.0 + 32.0,
        TempUnit::Kelvin => celsius + 273.15,
    }
}

fn convert_wind(ms: f64, unit: &WindUnit) -> f64 {
    match unit {
        WindUnit::Mps => ms,
        WindUnit::Kmph => ms * 3.6,
        WindUnit::Mph => ms * 2.236_94,
    }
}

fn format_time(iso_time: &str) -> String {
    if iso_time == "N/A" {
        return "N/A".to_string();
    }
    let time_part = iso_time.split('T').nth(1).unwrap_or(iso_time);
    time_part.chars().take(5).collect()
}

fn condition_icon_from_text(condition: &str) -> &'static str {
    let lower = condition.to_lowercase();
    if lower.contains("clear") {
        "☀️"
    } else if lower.contains("mainly clear") {
        "🌤️"
    } else if lower.contains("partly cloudy") {
        "⛅"
    } else if lower.contains("overcast") || lower.contains("cloudy") {
        "☁️"
    } else if lower.contains("fog") {
        "🌫️"
    } else if lower.contains("drizzle") {
        "🌦️"
    } else if lower.contains("rain") {
        "🌧️"
    } else if lower.contains("snow") {
        "❄️"
    } else if lower.contains("thunder") {
        "⛈️"
    } else {
        "🌡️"
    }
}

fn moon_emoji_from_phase(phase: &str) -> &'static str {
    let p = phase.to_lowercase();

    if p.contains("new moon") {
        "🌑"
    } else if p.contains("waxing crescent") {
        "🌒"
    } else if p.contains("first quarter") {
        "🌓"
    } else if p.contains("waxing gibbous") {
        "🌔"
    } else if p.contains("full moon") {
        "🌕"
    } else if p.contains("waning gibbous") {
        "🌖"
    } else if p.contains("last quarter") || p.contains("third quarter") {
        "🌗"
    } else if p.contains("waning crescent") {
        "🌘"
    } else {
        "🌙"
    }
}

fn translate_moon_phase(phase: &str, lang: &Language) -> String {
    if *lang == Language::English {
        return phase.to_string();
    }

    match phase {
        "New Moon" => "Новолуние".to_string(),
        "Waxing Crescent" => "Растущий серп".to_string(),
        "First Quarter" => "Первая четверть".to_string(),
        "Waxing Gibbous" => "Растущая луна".to_string(),
        "Full Moon" => "Полнолуние".to_string(),
        "Waning Gibbous" => "Убывающая луна".to_string(),
        "Last Quarter" => "Последняя четверть".to_string(),
        "Waning Crescent" => "Убывающий серп".to_string(),
        _ => phase.to_string(),
    }
}

fn month_name_en(month: u32) -> &'static str {
    match month {
        1 => "January",
        2 => "February",
        3 => "March",
        4 => "April",
        5 => "May",
        6 => "June",
        7 => "July",
        8 => "August",
        9 => "September",
        10 => "October",
        11 => "November",
        12 => "December",
        _ => "Month",
    }
}

fn month_name_ru(month: u32) -> &'static str {
    match month {
        1 => "января",
        2 => "февраля",
        3 => "марта",
        4 => "апреля",
        5 => "мая",
        6 => "июня",
        7 => "июля",
        8 => "августа",
        9 => "сентября",
        10 => "октября",
        11 => "ноября",
        12 => "декабря",
        _ => "",
    }
}

fn translate_condition(condition_en: &str, lang: &Language) -> String {
    if *lang == Language::English {
        return condition_en.to_string();
    }

    match condition_en {
        "Clear sky" => "Ясно".to_string(),
        "Mainly clear" => "Преимущественно ясно".to_string(),
        "Partly cloudy" => "Переменная облачность".to_string(),
        "Overcast" => "Пасмурно".to_string(),
        "Fog" => "Туман".to_string(),
        "Depositing rime fog" => "Изморозь".to_string(),
        "Light drizzle" => "Лёгкая морось".to_string(),
        "Moderate drizzle" => "Умеренная морось".to_string(),
        "Dense drizzle" => "Сильная морось".to_string(),
        "Light freezing drizzle" => "Лёгкая переохлаждённая морось".to_string(),
        "Dense freezing drizzle" => "Сильная переохлаждённая морось".to_string(),
        "Slight rain" => "Небольшой дождь".to_string(),
        "Moderate rain" => "Умеренный дождь".to_string(),
        "Heavy rain" => "Сильный дождь".to_string(),
        "Light freezing rain" => "Лёгкий ледяной дождь".to_string(),
        "Heavy freezing rain" => "Сильный ледяной дождь".to_string(),
        "Slight snow fall" => "Небольшой снег".to_string(),
        "Moderate snow fall" => "Умеренный снег".to_string(),
        "Heavy snow fall" => "Сильный снег".to_string(),
        "Snow grains" => "Снежные зёрна".to_string(),
        "Slight rain showers" => "Небольшие ливни".to_string(),
        "Moderate rain showers" => "Умеренные ливни".to_string(),
        "Violent rain showers" => "Сильные ливни".to_string(),
        "Slight snow showers" => "Небольшой снегопад".to_string(),
        "Heavy snow showers" => "Сильный снегопад".to_string(),
        "Thunderstorm" => "Гроза".to_string(),
        "Thunderstorm with slight hail" => "Гроза с небольшим градом".to_string(),
        "Thunderstorm with heavy hail" => "Гроза с сильным градом".to_string(),
        _ => condition_en.to_string(),
    }
}

fn format_forecast_label(date_str: &str, index: usize, lang: &Language) -> String {
    let parts: Vec<&str> = date_str.split('-').collect();
    if parts.len() != 3 {
        return date_str.to_string();
    }

    let month = parts[1].parse::<u32>().unwrap_or(0);
    let day = parts[2].parse::<u32>().unwrap_or(0);

    match index {
        0 => {
            if *lang == Language::English {
                "Today".to_string()
            } else {
                "Сегодня".to_string()
            }
        }
        1 => {
            if *lang == Language::English {
                "Tomorrow".to_string()
            } else {
                "Завтра".to_string()
            }
        }
        2 => {
            if *lang == Language::English {
                "In 2 days".to_string()
            } else {
                "Через 2 дня".to_string()
            }
        }
        3 => {
            if *lang == Language::English {
                "In 3 days".to_string()
            } else {
                "Через 3 дня".to_string()
            }
        }
        _ => {
            if *lang == Language::English {
                format!("{} {}", month_name_en(month), day)
            } else {
                format!("{} {}", day, month_name_ru(month))
            }
        }
    }
}

fn open_link(url: &str) {
    use gloo_utils::window;
    let _ = window().open_with_url_and_target(url, "_blank");
}

// ---------- API ----------
async fn fetch_weather(
    city: &str,
    temp_unit: TempUnit,
    wind_unit: WindUnit,
) -> Result<WeatherResponse, String> {
    let url = format!("{}/{}", API_URL, urlencoding::encode(city));

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

    let mut data: WeatherResponse =
        serde_json::from_str(&text).map_err(|e| format!("Failed to parse weather data: {e}"))?;

    data.current.temperature = convert_temp(data.current.temperature, &temp_unit);
    data.current.wind_speed = convert_wind(data.current.wind_speed, &wind_unit);

    data.yesterday.temperature_max = convert_temp(data.yesterday.temperature_max, &temp_unit);
    data.yesterday.temperature_min = convert_temp(data.yesterday.temperature_min, &temp_unit);
    data.yesterday.wind_speed_max = convert_wind(data.yesterday.wind_speed_max, &wind_unit);

    for f in &mut data.forecast {
        f.temperature_max = convert_temp(f.temperature_max, &temp_unit);
        f.temperature_min = convert_temp(f.temperature_min, &temp_unit);
        f.wind_speed_max = convert_wind(f.wind_speed_max, &wind_unit);
    }

    Ok(data)
}

// ---------- Download Menu ----------
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DownloadOs {
    Android,
    Windows,
    MacOS,
    Linux,
}

fn download_label(os: DownloadOs, lang: &Language) -> &'static str {
    match (os, lang) {
        (DownloadOs::Android, Language::English) => "Android",
        (DownloadOs::Windows, Language::English) => "Windows",
        (DownloadOs::MacOS, Language::English) => "macOS",
        (DownloadOs::Linux, Language::English) => "Linux",
        (DownloadOs::Android, Language::Russian) => "Android",
        (DownloadOs::Windows, Language::Russian) => "Windows",
        (DownloadOs::MacOS, Language::Russian) => "macOS",
        (DownloadOs::Linux, Language::Russian) => "Linux",
    }
}

fn download_description(os: DownloadOs, lang: &Language) -> &'static str {
    match (os, lang) {
        (DownloadOs::Android, Language::English) => "APK for phones",
        (DownloadOs::Windows, Language::English) => "Installer for PC",
        (DownloadOs::MacOS, Language::English) => "macOS app",
        (DownloadOs::Linux, Language::English) => "Linux build",
        (DownloadOs::Android, Language::Russian) => "APK для телефона",
        (DownloadOs::Windows, Language::Russian) => "Установщик для ПК",
        (DownloadOs::MacOS, Language::Russian) => "Приложение для macOS",
        (DownloadOs::Linux, Language::Russian) => "Сборка для Linux",
    }
}

fn download_url(os: DownloadOs) -> &'static str {
    match os {
        DownloadOs::Android => "/downloads/YarikWeather-Android.apk",
        DownloadOs::Windows => "/downloads/YarikWeather-Windows.exe",
        DownloadOs::MacOS => "/downloads/YarikWeather-MacOS.dmg",
        DownloadOs::Linux => "/downloads/YarikWeather-Linux.AppImage",
    }
}

#[component]
fn DownloadModal(lang: Language, theme: Theme, on_close: EventHandler<()>) -> Element {
    let mut selected = use_signal(|| DownloadOs::Android);

    rsx! {
        div { class: "modal-overlay",
            div { class: "modal download-modal",
                div { class: "modal-topbar",
                    h2 {
                        if lang == Language::English {
                            "Downloads"
                        } else {
                            "Загрузки"
                        }
                    }
                    button {
                        class: "close-btn",
                        onclick: move |_| on_close.call(()),
                        "✖"
                    }
                }

                p { class: "modal-subtitle",
                    if lang == Language::English {
                        "Choose your platform and download the app."
                    } else {
                        "Выберите платформу и скачайте приложение."
                    }
                }

                div { class: "download-grid",
                    for os in [DownloadOs::Android, DownloadOs::Windows, DownloadOs::MacOS, DownloadOs::Linux] {
                        {
                            let active = selected() == os;

                            let icon = match os {
                                DownloadOs::Android => ANDROID_ICON,
                                DownloadOs::Windows => WINDOWS_ICON,
                                DownloadOs::MacOS => apple_icon(theme),
                                DownloadOs::Linux => LINUX_ICON,
                            };

                            rsx! {
                                div {
                                    class: if active { "download-card active" } else { "download-card" },
                                    onclick: move |_| selected.set(os),
                                    img { class: "download-card-icon", src: icon }
                                    div { class: "download-card-title", "{download_label(os, &lang)}" }
                                    div { class: "download-card-desc", "{download_description(os, &lang)}" }
                                }
                            }
                        }
                    }
                }

                button {
                    class: "primary-btn download-confirm-btn",
                    onclick: move |_| open_link(download_url(selected())),
                    if lang == Language::English {
                        "Download"
                    } else {
                        "Скачать"
                    }
                }
            }
        }
    }
}

// ---------- Settings Modal ----------
#[component]
fn SettingsModal(
    settings: UserSettings,
    on_save: EventHandler<UserSettings>,
    on_close: EventHandler<()>,
) -> Element {
    let mut temp_settings = use_signal(|| settings.clone());
    let lang = temp_settings().language.clone();

    let handle_close = move |_| {
        let new_settings = temp_settings();
        save_settings(&new_settings);
        on_save.call(new_settings);
        on_close.call(());
    };

    rsx! {
        div { class: "modal-overlay",
            div { class: "modal",
                div { class: "modal-topbar",
                    h2 {
                        if lang == Language::English {
                            "Settings"
                        } else {
                            "Настройки"
                        }
                    }
                    button { class: "close-btn", onclick: handle_close, "✖" }
                }

                // All setting rows (unchanged)
                div { class: "setting-row",
                    label {
                        if lang == Language::English {
                            "Language:"
                        } else {
                            "Язык:"
                        }
                    }
                    div { class: "choice-group",
                        button {
                            class: choice_btn_class(temp_settings().language == Language::English),
                            onclick: move |_| temp_settings.write().language = Language::English,
                            "English"
                        }
                        button {
                            class: choice_btn_class(temp_settings().language == Language::Russian),
                            onclick: move |_| temp_settings.write().language = Language::Russian,
                            "Русский"
                        }
                    }
                }

                div { class: "setting-row",
                    label {
                        if lang == Language::English {
                            "Temperature unit:"
                        } else {
                            "Единица температуры:"
                        }
                    }
                    div { class: "choice-group",
                        button {
                            class: choice_btn_class(temp_settings().temp_unit == TempUnit::Celsius),
                            onclick: move |_| temp_settings.write().temp_unit = TempUnit::Celsius,
                            if lang == Language::English {
                                "Celsius (°C)"
                            } else {
                                "Цельсий (°C)"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().temp_unit == TempUnit::Fahrenheit),
                            onclick: move |_| temp_settings.write().temp_unit = TempUnit::Fahrenheit,
                            if lang == Language::English {
                                "Fahrenheit (°F)"
                            } else {
                                "Фаренгейт (°F)"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().temp_unit == TempUnit::Kelvin),
                            onclick: move |_| temp_settings.write().temp_unit = TempUnit::Kelvin,
                            if lang == Language::English {
                                "Kelvin (K)"
                            } else {
                                "Кельвин (K)"
                            }
                        }
                    }
                }

                div { class: "setting-row",
                    label {
                        if lang == Language::English {
                            "Wind unit:"
                        } else {
                            "Единица ветра:"
                        }
                    }
                    div { class: "choice-group",
                        button {
                            class: choice_btn_class(temp_settings().wind_unit == WindUnit::Mps),
                            onclick: move |_| temp_settings.write().wind_unit = WindUnit::Mps,
                            if lang == Language::English {
                                "m/s"
                            } else {
                                "м/с"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().wind_unit == WindUnit::Kmph),
                            onclick: move |_| temp_settings.write().wind_unit = WindUnit::Kmph,
                            if lang == Language::English {
                                "km/h"
                            } else {
                                "км/ч"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().wind_unit == WindUnit::Mph),
                            onclick: move |_| temp_settings.write().wind_unit = WindUnit::Mph,
                            if lang == Language::English {
                                "mph"
                            } else {
                                "миль/ч"
                            }
                        }
                    }
                }

                div { class: "setting-row",
                    label {
                        if lang == Language::English {
                            "Theme:"
                        } else {
                            "Тема:"
                        }
                    }
                    div { class: "choice-group",
                        button {
                            class: choice_btn_class(temp_settings().theme == Theme::Auto),
                            onclick: move |_| temp_settings.write().theme = Theme::Auto,
                            if lang == Language::English {
                                "Auto"
                            } else {
                                "Авто"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().theme == Theme::Light),
                            onclick: move |_| temp_settings.write().theme = Theme::Light,
                            if lang == Language::English {
                                "Light"
                            } else {
                                "Светлая"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().theme == Theme::Dark),
                            onclick: move |_| temp_settings.write().theme = Theme::Dark,
                            if lang == Language::English {
                                "Dark"
                            } else {
                                "Тёмная"
                            }
                        }
                    }
                }

                div { class: "setting-row",
                    label {
                        if lang == Language::English {
                            "Default city:"
                        } else {
                            "Город по умолчанию:"
                        }
                    }
                    input {
                        class: "text-input",
                        value: temp_settings().default_city.clone(),
                        oninput: move |e| temp_settings.write().default_city = e.value(),
                    }
                }
            
            // Removed the modal-actions div entirely
            }
        }
    }
}

// ---------- Welcome Modal ----------
#[component]
fn WelcomeModal(on_complete: EventHandler<UserSettings>) -> Element {
    let mut temp_settings = use_signal(UserSettings::default);
    let lang = temp_settings().language.clone();

    rsx! {
        div { class: "modal-overlay",
            div { class: "modal welcome-modal",
                h2 {
                    if lang == Language::English {
                        "Welcome to Yarik Weather!"
                    } else {
                        "Добро пожаловать в Yarik Weather!"
                    }
                }
                p {
                    if lang == Language::English {
                        "Choose your preferences and start."
                    } else {
                        "Выберите настройки и начните."
                    }
                }

                div { class: "setting-row",
                    label {
                        if lang == Language::English {
                            "Language:"
                        } else {
                            "Язык:"
                        }
                    }
                    div { class: "choice-group",
                        button {
                            class: choice_btn_class(temp_settings().language == Language::English),
                            onclick: move |_| temp_settings.write().language = Language::English,
                            "English"
                        }
                        button {
                            class: choice_btn_class(temp_settings().language == Language::Russian),
                            onclick: move |_| temp_settings.write().language = Language::Russian,
                            "Русский"
                        }
                    }
                }

                div { class: "setting-row",
                    label {
                        if lang == Language::English {
                            "Temperature unit:"
                        } else {
                            "Единица температуры:"
                        }
                    }
                    div { class: "choice-group",
                        button {
                            class: choice_btn_class(temp_settings().temp_unit == TempUnit::Celsius),
                            onclick: move |_| temp_settings.write().temp_unit = TempUnit::Celsius,
                            if lang == Language::English {
                                "Celsius (°C)"
                            } else {
                                "Цельсий (°C)"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().temp_unit == TempUnit::Fahrenheit),
                            onclick: move |_| temp_settings.write().temp_unit = TempUnit::Fahrenheit,
                            if lang == Language::English {
                                "Fahrenheit (°F)"
                            } else {
                                "Фаренгейт (°F)"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().temp_unit == TempUnit::Kelvin),
                            onclick: move |_| temp_settings.write().temp_unit = TempUnit::Kelvin,
                            if lang == Language::English {
                                "Kelvin (K)"
                            } else {
                                "Кельвин (K)"
                            }
                        }
                    }
                }

                div { class: "setting-row",
                    label {
                        if lang == Language::English {
                            "Wind unit:"
                        } else {
                            "Единица ветра:"
                        }
                    }
                    div { class: "choice-group",
                        button {
                            class: choice_btn_class(temp_settings().wind_unit == WindUnit::Mps),
                            onclick: move |_| temp_settings.write().wind_unit = WindUnit::Mps,
                            if lang == Language::English {
                                "m/s"
                            } else {
                                "м/с"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().wind_unit == WindUnit::Kmph),
                            onclick: move |_| temp_settings.write().wind_unit = WindUnit::Kmph,
                            if lang == Language::English {
                                "km/h"
                            } else {
                                "км/ч"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().wind_unit == WindUnit::Mph),
                            onclick: move |_| temp_settings.write().wind_unit = WindUnit::Mph,
                            if lang == Language::English {
                                "mph"
                            } else {
                                "миль/ч"
                            }
                        }
                    }
                }

                div { class: "setting-row",
                    label {
                        if lang == Language::English {
                            "Theme:"
                        } else {
                            "Тема:"
                        }
                    }
                    div { class: "choice-group",
                        button {
                            class: choice_btn_class(temp_settings().theme == Theme::Auto),
                            onclick: move |_| temp_settings.write().theme = Theme::Auto,
                            if lang == Language::English {
                                "Auto"
                            } else {
                                "Авто"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().theme == Theme::Light),
                            onclick: move |_| temp_settings.write().theme = Theme::Light,
                            if lang == Language::English {
                                "Light"
                            } else {
                                "Светлая"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().theme == Theme::Dark),
                            onclick: move |_| temp_settings.write().theme = Theme::Dark,
                            if lang == Language::English {
                                "Dark"
                            } else {
                                "Тёмная"
                            }
                        }
                    }
                }

                div { class: "setting-row",
                    label {
                        if lang == Language::English {
                            "Default city:"
                        } else {
                            "Город по умолчанию:"
                        }
                    }
                    input {
                        class: "text-input",
                        placeholder: if lang == Language::English { "Enter city name" } else { "Введите название города" },
                        value: temp_settings().default_city.clone(),
                        oninput: move |e| temp_settings.write().default_city = e.value(),
                    }
                }

                button {
                    class: "primary-btn",
                    onclick: move |_| {
                        let mut new_settings = temp_settings();
                        new_settings.first_time = false;
                        save_settings(&new_settings);
                        on_complete.call(new_settings);
                    },
                    if lang == Language::English {
                        "Get Started"
                    } else {
                        "Начать"
                    }
                }
            }
        }
    }
}

// ---------- Search Bar ----------
#[component]
fn SearchBar(on_search: EventHandler<String>) -> Element {
    let mut city = use_signal(|| "".to_string());
    let lang = get_settings().language;

    rsx! {
        div { class: "search-container",
            input {
                class: "city-input",
                placeholder: if lang == Language::English { "Enter city name..." } else { "Введите название города..." },
                value: city(),
                oninput: move |e| city.set(e.value()),
                onkeydown: move |event| {
                    if event.key() == Key::Enter {
                        let trimmed = city().trim().to_string();
                        if !trimmed.is_empty() {
                            on_search.call(trimmed);
                        }
                    }
                },
            }
            button {
                class: "search-btn",
                onclick: move |_| {
                    let trimmed = city().trim().to_string();
                    if !trimmed.is_empty() {
                        on_search.call(trimmed);
                    }
                },
                if lang == Language::English {
                    "Search"
                } else {
                    "Поиск"
                }
            }
        }
    }
}

// ---------- Weather Display ----------
#[component]
fn WeatherDisplay(
    data: WeatherResponse,
    temp_unit: TempUnit,
    wind_unit: WindUnit,
    lang: Language,
) -> Element {
    let temp_unit_str = match temp_unit {
        TempUnit::Celsius => "°C",
        TempUnit::Fahrenheit => "°F",
        TempUnit::Kelvin => "K",
    };

    let wind_unit_str = match wind_unit {
        WindUnit::Mps => {
            if lang == Language::English {
                "m/s"
            } else {
                "м/с"
            }
        }
        WindUnit::Kmph => {
            if lang == Language::English {
                "km/h"
            } else {
                "км/ч"
            }
        }
        WindUnit::Mph => {
            if lang == Language::English {
                "mph"
            } else {
                "миль/ч"
            }
        }
    };

    let condition_icon_str = condition_icon_from_text(&data.current.condition);

    rsx! {
        div { class: "weather-container",
            div { class: "current-weather glass-card",
                div { class: "city-line",
                    h2 { "{data.city}" }
                }

                div { class: "temp-large",
                    {format!("{:.1}{}", data.current.temperature, temp_unit_str)}
                }

                div { class: "condition-line",
                    span { class: "condition-icon", "{condition_icon_str}" }
                    span { class: "condition-text",
                        "{translate_condition(&data.current.condition, &lang)}"
                    }
                }

                div { class: "weather-details",
                    p {
                        {
                            format!(
                                "💨 {}: {:.1} {}",
                                if lang == Language::English { "Wind" } else { "Ветер" },
                                data.current.wind_speed,
                                wind_unit_str,
                            )
                        }
                    }
                }
            }

            div { class: "forecast-section glass-card",
                h3 {
                    if lang == Language::English {
                        "7-Day Forecast"
                    } else {
                        "Прогноз на 7 дней"
                    }
                }
                div { class: "forecast-grid",
                    for (idx , f) in data.forecast.iter().enumerate().take(7) {
                        {
                            let label = format_forecast_label(&f.date, idx, &lang);
                            let icon = condition_icon_from_text(&f.condition);
                            let bar_height = ((f.temperature_max + 20.0) * 2.4).clamp(28.0, 165.0);

                            rsx! {
                                div { class: "forecast-card",
                                    div { class: "bar-label", "{label}" }
                                    div { class: "bar-wrap",
                                        div { class: "bar", style: format!("height: {bar_height}px;") }
                                    }
                                    div { class: "bar-value", {format!("{:.0}{}", f.temperature_max, temp_unit_str)} }
                                    div { class: "bar-min", {format!("{:.0}{}", f.temperature_min, temp_unit_str)} }
                                    div { class: "bar-icon", "{icon}" }
                                    div { class: "bar-text", "{translate_condition(&f.condition, &lang)}" }
                                    div { class: "bar-wind",
                                        {
                                            format!(
                                                "{} {:.1} {}",
                                                if lang == Language::English { "wind:" } else { "ветер:" },
                                                f.wind_speed_max,
                                                wind_unit_str,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if let Some(first_day) = data.forecast.first() {
                {
                    let moon_phase = first_day
                        .moon_phase_name
                        .clone()
                        .unwrap_or_else(|| "Unknown".to_string());

                    let moon_emoji = moon_emoji_from_phase(&moon_phase);

                    let moon_percent = first_day
                        .moon_illumination
                        .map(|v| format!("{:.0}%", v))
                        .unwrap_or_else(|| "N/A".to_string());

                    rsx! {
                        div { class: "astronomy-section glass-card",
                            h3 {
                                if lang == Language::English {
                                    "Sun & Moon"
                                } else {
                                    "Солнце и Луна"
                                }
                            }

        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        

        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
                            div { class: "astronomy-grid",
                                div { class: "astro-card",
                                    p {
                                        {
                                            format!(
                                                "🌅 {}: {}",
                                                if lang == Language::English { "Sunrise" } else { "Восход" },
                                                first_day.sunrise.as_deref().map(format_time).unwrap_or("N/A".to_string()),
                                            )
                                        }
                                    }
                                    p {
                                        {
                                            format!(
                                                "🌇 {}: {}",
                                                if lang == Language::English { "Sunset" } else { "Закат" },
                                                first_day.sunset.as_deref().map(format_time).unwrap_or("N/A".to_string()),
                                            )
                                        }
                                    }
                                }
        
                                div { class: "astro-card",
                                    p { "{moon_emoji}" }
                                    p { "{translate_moon_phase(&moon_phase, &lang)}" }
                                    p {
                                        {
                                            if lang == Language::English {
                                                format!("Illumination: {}", moon_percent)
                                            } else {
                                                format!("Освещённость: {}", moon_percent)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ---------- Main ----------
fn main() {
    #[cfg(target_arch = "wasm32")]
    {
        std::panic::set_hook(Box::new(console_error_panic_hook::hook));
        console_log::init_with_level(log::Level::Debug).expect("error initializing logger");
    }

    dioxus::launch(App);
}

#[component]
fn App() -> Element {
    let mut settings = use_signal(get_settings);
    // let theme = resolve_theme(settings().theme);

    // let android_icon = ANDROID_ICON;
    // let windows_icon = WINDOWS_ICON;
    // let linux_icon = LINUX_ICON;
    // let apple_icon = apple_icon(theme);
    let weather = use_signal(|| None::<WeatherResponse>);
    let loading = use_signal(|| false);
    let error = use_signal(|| None::<String>);
    let mut show_settings = use_signal(|| false);
    let mut show_welcome = use_signal(|| settings().first_time);
    let mut show_downloads = use_signal(|| false);
    let mut initial_fetch_done = use_signal(|| false);

    let lang: Language = settings().language.clone();
    let resolved_theme = resolve_theme(settings().theme);

    let theme_class = match resolved_theme {
        Theme::Light => "theme-light",
        Theme::Dark => "theme-dark",
        Theme::Auto => "theme-light",
    };

    let fetch_and_set = {
        let weather = weather;
        let loading = loading;
        let error = error;

        move |city: String, temp_unit: TempUnit, wind_unit: WindUnit| {
            let mut weather = weather;
            let mut loading = loading;
            let mut error = error;

            loading.set(true);
            error.set(None);

            spawn(async move {
                match fetch_weather(&city, temp_unit, wind_unit).await {
                    Ok(data) => {
                        weather.set(Some(data));
                        error.set(None);
                    }
                    Err(msg) => {
                        weather.set(None);
                        error.set(Some(msg));
                    }
                }
                loading.set(false);
            });
        }
    };

    use_effect(move || {
        if initial_fetch_done() {
            return;
        }

        if !settings().first_time {
            initial_fetch_done.set(true);
            let city = settings().default_city.clone();
            let temp_unit = settings().temp_unit.clone();
            let wind_unit = settings().wind_unit.clone();
            fetch_and_set(city, temp_unit, wind_unit);
        }
    });

    rsx! {
        document::Link { rel: "stylesheet", href: CSS }
        document::Link { rel: "icon", href: FAVICON }

        div { class: format!("app-shell {}", theme_class),
            div { class: "app-container",
                div { class: "header glass-card",
                    div { class: "brand",
                        img { src: FAVICON, class: "header-icon" }
                        h1 { "Yarik Weather" }
                    }

                    div { class: "header-buttons",
                        button {
                            class: "icon-btn",
                            onclick: move |_| {
                                let mut new_settings = settings();
                                new_settings.theme = cycle_theme(new_settings.theme);
                                save_settings(&new_settings);
                                settings.set(new_settings);
                            },
                            {theme_icon(settings().theme)}
                        }
                        button {
                            class: "icon-btn",
                            onclick: move |_| show_downloads.set(true),
                            "📥"
                        }
                        button {
                            class: "icon-btn",
                            onclick: move |_| show_settings.set(true),
                            "⚙️"
                        }
                    }
                }

                SearchBar {
                    on_search: move |city: String| {
                        let temp_unit = settings().temp_unit.clone();
                        let wind_unit = settings().wind_unit.clone();
                        fetch_and_set(city, temp_unit, wind_unit);
                    },
                }

                if loading() {
                    div { class: "status-card glass-card",
                        if lang == Language::English {
                            "Loading weather data..."
                        } else {
                            "Загрузка данных о погоде..."
                        }
                    }
                }

                if let Some(err) = error() {
                    div { class: "status-card error-card glass-card",
                        div { class: "error-title",
                            if lang == Language::English {
                                "Error"
                            } else {
                                "Ошибка"
                            }
                        }
                        div { class: "error-message", "{err}" }
                    }
                }

                if let Some(ref data) = weather() {
                    WeatherDisplay {
                        data: data.clone(),
                        temp_unit: settings().temp_unit.clone(),
                        wind_unit: settings().wind_unit.clone(),
                        lang: settings().language.clone(),
                    }
                } else if !loading() && error().is_none() && !settings().first_time {
                    div { class: "status-card glass-card",
                        if lang == Language::English {
                            "Search for a city to see the weather."
                        } else {
                            "Введите город, чтобы увидеть погоду."
                        }
                    }
                }

                if show_settings() {
                    SettingsModal {
                        settings: settings(),
                        on_save: move |new_settings: UserSettings| {
                            settings.set(new_settings.clone());
                            save_settings(&new_settings);
                            let city = new_settings.default_city.clone();
                            fetch_and_set(
                                city,
                                new_settings.temp_unit.clone(),
                                new_settings.wind_unit.clone(),
                            );
                            show_settings.set(false);
                        },
                        on_close: move |_| show_settings.set(false),
                    }
                }

                if show_downloads() {
                    DownloadModal {
                        lang: settings().language.clone(),
                        theme: settings().theme,
                        on_close: move |_| show_downloads.set(false),
                    }
                }

                if show_welcome() {
                    WelcomeModal {
                        on_complete: move |new_settings: UserSettings| {
                            settings.set(new_settings.clone());
                            show_welcome.set(false);
                            let city = new_settings.default_city.clone();
                            fetch_and_set(
                                city,
                                new_settings.temp_unit.clone(),
                                new_settings.wind_unit.clone(),
                            );
                        },
                    }
                }
            }
        }
    }
}
