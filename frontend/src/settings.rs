use crate::api::SETTINGS_KEY;
use crate::assets::APPLE_DARK;
use crate::assets::APPLE_LIGHT;

use dioxus::prelude::*;
use gloo_storage::{LocalStorage, Storage};
use serde::{Deserialize, Serialize};

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

pub fn apple_icon(theme: Theme) -> Asset {
    match theme {
        Theme::Light => APPLE_DARK,
        Theme::Dark => APPLE_LIGHT,
        Theme::Auto => APPLE_LIGHT,
    }
}

pub fn get_settings() -> UserSettings {
    LocalStorage::get(SETTINGS_KEY).unwrap_or_default()
}

pub fn save_settings(settings: &UserSettings) {
    let _ = LocalStorage::set(SETTINGS_KEY, settings);
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
