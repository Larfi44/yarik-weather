use crate::helpers::{convert_temp, get_approx_lat, get_approx_lon, is_coastal_city};
use crate::settings::{Language, TempUnit};
use crate::types::WeatherResponse;
use dioxus::prelude::*;
use gloo_net::http::Request;
use serde_json::Value;

const YAROSLAV_AI: Asset = asset!("/assets/yaroslav_ai.svg");

// Helper to format a temperature with the correct unit and conversion
fn format_temp(celsius: f64, unit: &TempUnit, lang: &Language) -> String {
    let converted = convert_temp(celsius, unit);
    let unit_str = match unit {
        TempUnit::Celsius => "°C",
        TempUnit::Fahrenheit => "°F",
        TempUnit::Kelvin => "K",
    };
    format!("{:.1}{}", converted, unit_str)
}

// Localize "mm" for Russian
fn rain_unit(lang: &Language) -> &'static str {
    if *lang == Language::Russian {
        "мм"
    } else {
        "mm"
    }
}

// Helper function to render predictions block
fn render_predictions(pred: &Value, lang: Language, temp_unit: &TempUnit) -> Element {
    let week = &pred["next_week"];
    let months = pred["next_months"].as_array();

    let month_names_en = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    let month_names_ru = [
        "Январь",
        "Февраль",
        "Март",
        "Апрель",
        "Май",
        "Июнь",
        "Июль",
        "Август",
        "Сентябрь",
        "Октябрь",
        "Ноябрь",
        "Декабрь",
    ];

    let week_temp = week["avg_temp"].as_f64().unwrap_or(0.0);
    let week_rain = week["total_rain"].as_f64().unwrap_or(0.0);
    let week_uv = week["max_uv"].as_f64().unwrap_or(0.0);

    rsx! {
        div { style: "margin-top: 40px;", class: "ai-predictions",
            h3 {
                if lang == Language::English {
                    "Future outlook"
                } else {
                    "Прогноз на будущее"
                }
            }
            div { class: "ai-pred-card",
                h4 {
                    if lang == Language::English {
                        "Next week"
                    } else {
                        "След. неделя"
                    }
                }
                table { class: "ai-table",
                    tr {
                        td {
                            if lang == Language::English {
                                "🌡️ Avg temp"
                            } else {
                                "🌡️ Ср. темп."
                            }
                        }
                        td { {format_temp(week_temp, temp_unit, &lang)} }
                    }
                    tr {
                        td {
                            if lang == Language::English {
                                "🌧️ Total rain"
                            } else {
                                "🌧️ Осадки"
                            }
                        }
                        td { {format!("{:.1} {}", week_rain, rain_unit(&lang))} }
                    }
                    tr {
                        td {
                            if lang == Language::English {
                                "☀️ Max UV"
                            } else {
                                "☀️ Макс. УФ"
                            }
                        }
                        td { {format!("{:.1}", week_uv)} }
                    }
                }
            }
            if let Some(months) = months {
                for m in months {
                    {
                        let month_num = m["month"].as_u64().unwrap_or(1) as usize - 1;
                        let month_name = if lang == Language::English {
                            month_names_en[month_num]
                        } else {
                            month_names_ru[month_num]
                        };
                        let m_temp = m["avg_temp"].as_f64().unwrap_or(0.0);
                        let m_rain = m["total_rain"].as_f64().unwrap_or(0.0);
                        let m_uv = m["max_uv"].as_f64().unwrap_or(0.0);

                        rsx! {
                            div { class: "ai-pred-card",
                                h4 { "{month_name}" }
                                table { class: "ai-table",
                                    tr {
                                        td {
                                            if lang == Language::English {
                                                "🌡️ Avg temp"
                                            } else {
                                                "🌡️ Ср. темп."
                                            }
                                        }
                                        td { {format_temp(m_temp, temp_unit, &lang)} }
                                    }
                                    tr {
                                        td {
                                            if lang == Language::English {
                                                "🌧️ Total rain"
                                            } else {
                                                "🌧️ Осадки"
                                            }
                                        }
                                        td { {format!("{:.1} {}", m_rain, rain_unit(&lang))} }
                                    }
                                    tr {
                                        td {
                                            if lang == Language::English {
                                                "☀️ Max UV"
                                            } else {
                                                "☀️ Макс. УФ"
                                            }
                                        }
                                        td { {format!("{:.1}", m_uv)} }
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

#[component]
pub fn AiModal(
    weather: Option<WeatherResponse>,
    lang: Language,
    temp_unit: TempUnit,
    on_close: EventHandler<()>,
) -> Element {
    let mut tips = use_signal(|| None::<Vec<String>>);
    let mut predictions = use_signal(|| None::<Value>);
    let mut loading = use_signal(|| false);
    let mut error_msg = use_signal(|| None::<String>);

    let fetch_ai = move |_| {
        let w = match weather.clone() {
            Some(w) => w,
            None => return,
        };

        let lang_code = if lang == Language::English {
            "en"
        } else {
            "ru"
        };

        let today_body = serde_json::json!({
            "temperature": w.current.temperature,
            "wind_speed": w.current.wind_speed,
            "condition": w.current.condition,
            "pressure": w.current.pressure,
            "sea_temperature": w.current.sea_temperature,
            "uv_index": w.current.uv_index,
            "precipitation_probability": w.current.precipitation_probability,
            "humidity": 50.0,
            "hourly": w.hourly.iter().map(|h| serde_json::json!({
                "date": h.date,
                "time": h.time,
                "temperature": h.temperature,
                "wind_speed": h.wind_speed,
                "condition": h.condition,
                "sea_temperature": h.sea_temperature,
                "uv_index": h.uv_index,
                "precipitation_probability": h.precipitation_probability
            })).collect::<Vec<_>>(),
            "daily": w.forecast.iter().map(|d| serde_json::json!({
                "date": d.date,
                "temperature_max": d.temperature_max,
                "temperature_min": d.temperature_min,
                "wind_speed_max": d.wind_speed_max,
                "condition": d.condition,
                "uv_index_max": d.uv_index_max,
                "precipitation_probability_max": d.precipitation_probability_max
            })).collect::<Vec<_>>(),
            "lang": lang_code,
            "coastal": is_coastal_city(&w.city)
        });

        let predict_body = serde_json::json!({
            "lat": get_approx_lat(&w.city),
            "lon": get_approx_lon(&w.city),
            "city": &w.city,
            "lang": lang_code
        });

        loading.set(true);
        error_msg.set(None);
        tips.set(None);
        predictions.set(None);

        spawn(async move {
            let today_result =
                Request::post("https://bbao335ico5kgnos7cvu.containers.yandexcloud.net/today")
                    .json(&today_body)
                    .unwrap()
                    .send()
                    .await;

            let recs = match today_result {
                Ok(resp) if resp.ok() => match resp.json::<Value>().await {
                    Ok(json) => {
                        let arr = json["recommendations"].as_array();
                        if let Some(arr) = arr {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(String::from))
                                .collect::<Vec<_>>()
                        } else {
                            vec!["Invalid response format".into()]
                        }
                    }
                    Err(e) => vec![format!("Parse error: {e}")],
                },
                Ok(resp) => vec![format!("AI service error: {}", resp.status())],
                Err(e) => vec![format!("Network error: {e}")],
            };
            tips.set(Some(recs));

            let predict_result =
                Request::post("https://bbao335ico5kgnos7cvu.containers.yandexcloud.net/predict")
                    .json(&predict_body)
                    .unwrap()
                    .send()
                    .await;

            let pred = match predict_result {
                Ok(resp) if resp.ok() => resp.json::<Value>().await.ok(),
                _ => None,
            };
            predictions.set(pred);

            loading.set(false);
        });
    };

    rsx! {
        div { class: "modal-overlay",
            div { class: "modal ai-results-modal",
                div { class: "modal-topbar",
                    div { class: "ai-modal-title",
                        img {
                            src: YAROSLAV_AI,
                            class: "ai-logo-icon",
                            alt: "Yaroslav AI",
                        }
                        span { "Yaroslav AI" }
                    }
                    button {
                        class: "close-btn",
                        onclick: move |_| on_close.call(()),
                        "✖"
                    }
                }

                if loading() {
                    div { class: "ai-loading",
                        if lang == Language::English {
                            "Thinking..."
                        } else {
                            "Думаю..."
                        }
                    }
                }

                if let Some(ref err) = error_msg() {
                    div { class: "ai-error", style: "color: red;", "{err}" }
                }

                if let Some(ref t) = tips() {
                    h3 {
                        if lang == Language::English {
                            "Recommendations for now"
                        } else {
                            "Рекомендации на настоящее время"
                        }
                    }
                    div { class: "ai-tips",
                        for tip in t {
                            p { class: "ai-tip", "{tip}" }
                        }
                    }
                    {
                        let pred_ref = predictions();
                        if let Some(ref pred) = pred_ref {
                            render_predictions(pred, lang, &temp_unit)
                        } else {
                            rsx! {
                                Fragment {}
                            }
                        }
                    }
                } else if !loading() {
                    button { class: "primary-btn", onclick: fetch_ai,
                        if lang == Language::English {
                            "Use Yaroslav AI"
                        } else {
                            "Использовать Yaroslav AI"
                        }
                    }
                }
            }
        }
    }
}
