#![allow(warnings)]

use crate::api::fetch_weather;
#[cfg(target_arch = "wasm32")]
use crate::components::download_modal::DownloadModal;
use crate::components::search_bar::SearchBar;
use crate::components::settings_modal::SettingsModal;
use crate::components::weather_display::WeatherDisplay;
use crate::components::welcome_modal::WelcomeModal;
use crate::settings::cycle_theme;
use crate::settings::get_settings;
use crate::settings::save_settings;
use crate::settings::theme_icon;
use crate::settings::Language;
use crate::settings::TempUnit;
use crate::settings::Theme;
use crate::settings::UserSettings;
use crate::settings::WindUnit;
use crate::types::WeatherResponse;

use dioxus::prelude::*;

static CSS: Asset = asset!("/assets/main.css");
const FAVICON: Asset = asset!("/assets/favicon.svg");
fn favicon_data_url() -> String {
    let svg = include_str!("../assets/favicon.svg");
    format!("data:image/svg+xml;base64,{}", base64_encode(svg))
}

fn base64_encode(s: &str) -> String {
    use base64::{engine::general_purpose, Engine as _};
    general_purpose::STANDARD.encode(s)
}

#[component]
pub fn App() -> Element {
    let mut settings = use_signal(get_settings);

    let mut system_theme = use_signal(|| {
        #[cfg(target_arch = "wasm32")]
        {
            use gloo::utils::window;
            if let Ok(Some(media_query)) = window().match_media("(prefers-color-scheme: dark)") {
                return if media_query.matches() {
                    Theme::Dark
                } else {
                    Theme::Light
                };
            }
        }
        Theme::Light
    });

    // Update system theme when media query changes (web only)
    use_effect(move || {
        #[cfg(target_arch = "wasm32")]
        {
            use gloo::events::EventListener;
            use gloo::utils::window;
            use wasm_bindgen::JsCast;
            if let Ok(Some(media_query)) = window().match_media("(prefers-color-scheme: dark)") {
                let mut update = move |matches: bool| {
                    system_theme.set(if matches { Theme::Dark } else { Theme::Light });
                };
                update(media_query.matches());
                let listener = EventListener::new(&media_query, "change", move |event| {
                    if let Some(event) = event.dyn_ref::<web_sys::MediaQueryListEvent>() {
                        update(event.matches());
                    }
                });
                listener.forget();
            }
        }
    });

    let resolved_theme: Theme = match settings().theme {
        Theme::Auto => system_theme(),
        other => other,
    };

    let theme_class: &str = match resolved_theme {
        Theme::Light => "theme-light",
        Theme::Dark => "theme-dark",
        Theme::Auto => "theme-light",
    };

    let weather = use_signal(|| None::<WeatherResponse>);
    let loading = use_signal(|| false);
    let error = use_signal(|| None::<String>);
    let mut show_settings = use_signal(|| false);
    let mut show_welcome = use_signal(|| settings().first_time);
    let mut show_downloads = use_signal(|| false);
    let mut initial_fetch_done = use_signal(|| false);
    let lang: Language = settings().language.clone();

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
                        img { src: "{favicon_data_url()}", class: "header-icon" }
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
                        // Download button – only on web
                        {
                            #[cfg(target_arch = "wasm32")]
                            {
                                rsx! {
                                    button { class: "icon-btn", onclick: move |_| show_downloads.set(true), "📥" }
                                }
                            }
                            #[cfg(not(target_arch = "wasm32"))]
                            {
                                rsx! {
                                    Fragment {}
                                }
                            }
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
                        theme: resolved_theme,
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
                    if show_settings() {
                        SettingsModal {
                            settings: settings(),
                            theme: resolved_theme,
                            on_save: move |new_settings: UserSettings| {
                                let old = settings();
                                let needs_refetch = new_settings.default_city != old.default_city
                                    || new_settings.temp_unit != old.temp_unit
                                    || new_settings.wind_unit != old.wind_unit;
                                settings.set(new_settings.clone());
                                save_settings(&new_settings);
                                if needs_refetch {
                                    let city = new_settings.default_city.clone();
                                    fetch_and_set(
                                        city,
                                        new_settings.temp_unit.clone(),
                                        new_settings.wind_unit.clone(),
                                    );
                                }
                                show_settings.set(false);
                            },
                            on_close: move |_| show_settings.set(false),
                            on_change: move |new_settings: UserSettings| {
                                settings.set(new_settings);
                            },
                        }
                    }
                }
                // Download modal – only on web
                {
                    #[cfg(target_arch = "wasm32")]
                    {
                        rsx! {
                            if show_downloads() {
                                DownloadModal {
                                    lang: settings().language.clone(),
                                    theme: resolved_theme,
                                    on_close: move |_| show_downloads.set(false),
                                }
                            }
                        }
                    }
                    #[cfg(not(target_arch = "wasm32"))]
                    {
                        rsx! {
                            Fragment {}
                        }
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
                        on_change: move |new_settings: UserSettings| {
                            settings.set(new_settings);
                        },
                    }
                }
            }
        }
    }
}
