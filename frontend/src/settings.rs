use crate::assets::APPLE_DARK;
use crate::assets::APPLE_LIGHT;

use dioxus::prelude::*;
use serde::{Deserialize, Serialize};

pub const SETTINGS_KEY: &str = "weather_settings";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum Language {
    English,
    Russian,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TempUnit {
    Celsius,
    Fahrenheit,
    Kelvin,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum WindUnit {
    Mps,
    Kmph,
    Mph,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PressureUnit {
    HPa,
    MmHg,
    InHg,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Theme {
    Auto,
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UserSettings {
    pub temp_unit: TempUnit,
    pub wind_unit: WindUnit,
    pub language: Language,
    pub default_city: String,
    pub theme: Theme,
    pub first_time: bool,
    pub pressure_unit: PressureUnit,
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            temp_unit: TempUnit::Celsius,
            wind_unit: WindUnit::Mps,
            language: Language::English,
            default_city: String::new(),
            theme: Theme::Auto,
            first_time: true,
            pressure_unit: PressureUnit::HPa,
        }
    }
}

pub fn apple_icon(theme: Theme) -> Asset {
    match theme {
        Theme::Light => APPLE_DARK,
        Theme::Dark => APPLE_LIGHT,
        Theme::Auto => APPLE_LIGHT,
    }
}

// ── Web ──
#[cfg(target_arch = "wasm32")]
use gloo_storage::{LocalStorage, Storage};

#[cfg(target_arch = "wasm32")]
pub fn get_settings() -> UserSettings {
    LocalStorage::get(SETTINGS_KEY).unwrap_or_default()
}

#[cfg(target_arch = "wasm32")]
pub fn save_settings(settings: &UserSettings) {
    let _ = LocalStorage::set(SETTINGS_KEY, settings);
}

// ── Desktop ──
#[cfg(all(not(target_arch = "wasm32"), not(target_os = "android")))]
pub fn get_settings() -> UserSettings {
    let p = ::dirs::config_dir()
        .unwrap_or_default()
        .join("yarik-weather/settings.json");
    if p.exists() {
        if let Ok(c) = std::fs::read_to_string(&p) {
            if let Ok(s) = serde_json::from_str(&c) {
                return s;
            }
        }
    }
    UserSettings::default()
}

#[cfg(all(not(target_arch = "wasm32"), not(target_os = "android")))]
pub fn save_settings(settings: &UserSettings) {
    let d = ::dirs::config_dir()
        .unwrap_or_default()
        .join("yarik-weather");
    let _ = std::fs::create_dir_all(&d);
    let p = d.join("settings.json");
    if let Ok(j) = serde_json::to_string_pretty(settings) {
        let _ = std::fs::write(&p, j);
    }
}

pub fn cycle_theme(theme: Theme) -> Theme {
    match theme {
        Theme::Auto => Theme::Light,
        Theme::Light => Theme::Dark,
        Theme::Dark => Theme::Auto,
    }
}

pub fn choice_btn_class(active: bool) -> &'static str {
    if active {
        "choice-btn active"
    } else {
        "choice-btn"
    }
}

pub fn theme_icon(theme: Theme) -> &'static str {
    match theme {
        Theme::Auto => "🌓",
        Theme::Light => "☀️",
        Theme::Dark => "🌙",
    }
}
