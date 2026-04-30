use crate::helpers::condition_icon_from_text;
use crate::helpers::format_forecast_label;
use crate::helpers::format_time;
use crate::helpers::moon_emoji_from_phase;
use crate::helpers::translate_condition;
use crate::helpers::translate_moon_phase;
use crate::settings::Language;
use crate::settings::TempUnit;
use crate::settings::Theme;
use crate::settings::WindUnit;
use crate::types::DailyData;
use crate::types::WeatherResponse;

use dioxus::prelude::*;

use chrono::Local;

#[component]
pub fn WeatherDisplay(
    data: WeatherResponse,
    temp_unit: TempUnit,
    wind_unit: WindUnit,
    lang: Language,
    theme: Theme,
) -> Element {
    let temp_unit_str: &str = match temp_unit {
        TempUnit::Celsius => "°C",
        TempUnit::Fahrenheit => "°F",
        TempUnit::Kelvin => "K",
    };
    let wind_unit_str: &str = match wind_unit {
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
    let condition_icon_str: &str = condition_icon_from_text(&data.current.condition);
    let na = || "N/A".to_string();

    let (max_line_color, min_line_color, point_fill_max, point_fill_min, label_color) = match theme
    {
        Theme::Light => (
            "var(--accent, #cc6600)",
            "var(--accent2, #5a9e4b)",
            "var(--accent, #cc6600)",
            "var(--accent2, #5a9e4b)",
            "#000000",
        ),
        _ => (
            "var(--accent, orange)",
            "var(--accent)",
            "var(--accent, orange)",
            "var(--accent, orange)",
            "#ffffff",
        ),
    };
    let min_line_opacity: f64 = if theme == Theme::Light { 1.0 } else { 0.5 };

    // ---- Hourly chart ----
    #[allow(warnings)]
    struct HourlyPoint {
        x: f64,
        y: f64,
        index: usize,
        icon: &'static str,
        time: String,
        temp: f64,
        temp_str: String,
        time_str: String,
    }

    let h_min_temp = data
        .hourly
        .iter()
        .map(|h| h.temperature)
        .fold(f64::INFINITY, f64::min);
    let h_max_temp = data
        .hourly
        .iter()
        .map(|h| h.temperature)
        .fold(f64::NEG_INFINITY, f64::max);
    let h_temp_range = (h_max_temp - h_min_temp).max(0.1);

    let h_view_width: f64 = 1200.0;
    let h_view_height: f64 = 300.0;
    let h_padding: f64 = 60.0;
    let h_plot_width: f64 = h_view_width - 2.0 * h_padding;
    let h_plot_height: f64 = h_view_height - 2.0 * h_padding;

    let h_step_x: f64 = if data.hourly.len() > 1 {
        h_plot_width / (data.hourly.len() - 1) as f64
    } else {
        0.0
    };

    let h_to_y = |t: f64| -> f64 {
        h_view_height - h_padding - ((t - h_min_temp) / h_temp_range) * h_plot_height
    };

    let h_points_line: Vec<String> = data
        .hourly
        .iter()
        .enumerate()
        .map(|(i, h)| {
            format!(
                "{:.1},{:.1}",
                h_padding + h_step_x * i as f64,
                h_to_y(h.temperature)
            )
        })
        .collect();

    let h_points: &'static [HourlyPoint] = Vec::leak(
        data.hourly
            .iter()
            .enumerate()
            .map(|(i, h)| {
                let x = h_padding + h_step_x * i as f64;
                let y = h_to_y(h.temperature);
                let icon = condition_icon_from_text(&h.condition);
                let temp_str = format!("{:.0}{}", h.temperature, temp_unit_str);
                let time_str = h.time.clone();
                HourlyPoint {
                    x,
                    y,
                    index: i,
                    icon,
                    time: h.time.clone(),
                    temp: h.temperature,
                    temp_str,
                    time_str,
                }
            })
            .collect::<Vec<_>>(),
    );

    let mut h_hovered = use_signal(|| None::<usize>);

    let hourly_chart: VNode = rsx! {
        svg {
            view_box: format!("0 0 {:.0} {:.0}", h_view_width, h_view_height),
            width: "100%",
            style: format!("overflow: visible; display: block; min-width: {}px;", h_view_width),
            polyline {
                fill: "none",
                stroke: max_line_color,
                stroke_width: 2.5,
                stroke_linejoin: "round",
                stroke_linecap: "round",
                points: h_points_line.join(" "),
            }
            for p in h_points.iter() {
                circle {
                    cx: format!("{:.1}", p.x),
                    cy: format!("{:.1}", p.y),
                    r: if h_hovered() == Some(p.index) { 7 } else { 5 },
                    fill: max_line_color,
                    stroke: "white",
                    stroke_width: 1.5,
                    class: "chart-point",
                    onmouseenter: move |_| h_hovered.set(Some(p.index)),
                    onmouseleave: move |_| h_hovered.set(None),
                }
                text {
                    x: format!("{:.1}", p.x),
                    y: format!("{:.1}", p.y - 34.0),
                    text_anchor: "middle",
                    font_size: "20",
                    fill: "white",
                    stroke: "none",
                    "{p.icon}"
                }
                text {
                    x: format!("{:.1}", p.x),
                    y: format!("{:.1}", p.y - 16.0),
                    text_anchor: "middle",
                    font_size: "12",
                    fill: label_color,
                    stroke: "none",
                    "{p.temp_str}"
                }
                text {
                    x: format!("{:.1}", p.x),
                    y: format!("{:.0}", h_view_height - 8.0),
                    text_anchor: "middle",
                    font_size: "12",
                    fill: "var(--muted, #ccc)",
                    stroke: "none",
                    "{p.time_str}"
                }
            }
        }
    }
    .unwrap();

    // ---- Daily chart ----
    let mut chart_days: Vec<&DailyData> = Vec::with_capacity(1 + data.forecast.len());
    chart_days.push(&data.yesterday);
    for d in &data.forecast {
        chart_days.push(d);
    }

    let min_temp: f64 = chart_days
        .iter()
        .map(|d| d.temperature_min)
        .fold(f64::INFINITY, f64::min);
    let max_temp: f64 = chart_days
        .iter()
        .map(|d| d.temperature_max)
        .fold(f64::NEG_INFINITY, f64::max);
    let temp_range: f64 = (max_temp - min_temp).max(0.1);

    let chart_width: f64 = 800.0;
    let chart_height: f64 = 300.0;
    let padding: f64 = 60.0;
    let plot_width: f64 = chart_width - 2.0 * padding;
    let plot_height: f64 = chart_height - 2.0 * padding;

    let step_x: f64 = if chart_days.len() > 1 {
        plot_width / (chart_days.len() - 1) as f64
    } else {
        0.0
    };
    let to_y =
        |t: f64| -> f64 { chart_height - padding - ((t - min_temp) / temp_range) * plot_height };

    let max_points: Vec<String> = chart_days
        .iter()
        .enumerate()
        .map(|(i, d)| {
            format!(
                "{:.1},{:.1}",
                padding + step_x * i as f64,
                to_y(d.temperature_max)
            )
        })
        .collect();
    let min_points: Vec<String> = chart_days
        .iter()
        .enumerate()
        .map(|(i, d)| {
            format!(
                "{:.1},{:.1}",
                padding + step_x * i as f64,
                to_y(d.temperature_min)
            )
        })
        .collect();

    #[allow(warnings)]
    struct DailyPoint {
        x: f64,
        y_max: f64,
        y_min: f64,
        index: usize,
        icon: &'static str,
        label: String,
        max_temp: f64,
        min_temp: f64,
        wind: f64,
        condition: String,
        date: String,
        max_temp_str: String,
        min_temp_str: String,
    }

    let d_points: &'static [DailyPoint] = Vec::leak(
        chart_days
            .iter()
            .enumerate()
            .map(|(i, day)| {
                let x: f64 = padding + step_x * i as f64;
                let y_max: f64 = to_y(day.temperature_max);
                let y_min: f64 = to_y(day.temperature_min);
                let icon: &str = condition_icon_from_text(&day.condition);
                let label: String = if i == 0 {
                    if lang == Language::English {
                        "Yesterday".to_string()
                    } else {
                        "Вчера".to_string()
                    }
                } else {
                    format_forecast_label(&day.date, i - 1, &lang)
                };
                let max_temp_str: String = format!("{:.0}{}", day.temperature_max, temp_unit_str);
                let min_temp_str: String = format!("{:.0}{}", day.temperature_min, temp_unit_str);
                DailyPoint {
                    x,
                    y_max,
                    y_min,
                    index: i,
                    icon,
                    label,
                    max_temp: day.temperature_max,
                    min_temp: day.temperature_min,
                    wind: day.wind_speed_max,
                    condition: day.condition.clone(),
                    date: day.date.clone(),
                    max_temp_str,
                    min_temp_str,
                }
            })
            .collect::<Vec<_>>(),
    );

    let mut d_hovered = use_signal(|| None::<usize>);

    let daily_chart: VNode = rsx! {
        svg {
            view_box: format!("0 0 {:.0} {:.0}", chart_width, chart_height),
            width: "100%",
            style: format!("overflow: visible; display: block; min-width: {}px;", chart_width),
            polyline {
                fill: "none",
                stroke: max_line_color,
                stroke_width: 2.5,
                stroke_linejoin: "round",
                stroke_linecap: "round",
                points: max_points.join(" "),
            }
            polyline {
                fill: "none",
                stroke: min_line_color,
                stroke_opacity: format!("{}", min_line_opacity),
                stroke_width: 2.0,
                stroke_linejoin: "round",
                stroke_linecap: "round",
                points: min_points.join(" "),
            }
            for p in d_points.iter() {
                circle {
                    cx: format!("{:.1}", p.x),
                    cy: format!("{:.1}", p.y_max),
                    r: if d_hovered() == Some(p.index) { 7 } else { 5 },
                    fill: point_fill_max,
                    stroke: "white",
                    stroke_opacity: if theme == Theme::Light { 1.0 } else { 0.0 },
                    stroke_width: 1.5,
                    class: "chart-point",
                    onmouseenter: move |_| d_hovered.set(Some(p.index)),
                    onmouseleave: move |_| d_hovered.set(None),
                }
                circle {
                    cx: format!("{:.1}", p.x),
                    cy: format!("{:.1}", p.y_min),
                    r: if d_hovered() == Some(p.index) { 7 } else { 5 },
                    fill: point_fill_min,
                    stroke: "white",
                    stroke_opacity: if theme == Theme::Light { 1.0 } else { 0.0 },
                    stroke_width: 1.5,
                    class: "chart-point",
                    onmouseenter: move |_| d_hovered.set(Some(p.index)),
                    onmouseleave: move |_| d_hovered.set(None),
                }
                text {
                    x: format!("{:.1}", p.x),
                    y: format!("{:.1}", p.y_max - 16.0),
                    text_anchor: "middle",
                    font_size: "12",
                    fill: max_line_color,
                    stroke: "none",
                    "{p.max_temp_str}"
                }
                text {
                    x: format!("{:.1}", p.x),
                    y: format!("{:.1}", p.y_min + 22.0),
                    text_anchor: "middle",
                    font_size: "12",
                    fill: min_line_color,
                    stroke: "none",
                    "{p.min_temp_str}"
                }
                text {
                    x: format!("{:.1}", p.x),
                    y: format!("{:.1}", p.y_max - 34.0),
                    text_anchor: "middle",
                    font_size: "22",
                    fill: "white",
                    stroke: "none",
                    "{p.icon}"
                }
                text {
                    x: format!("{:.1}", p.x),
                    y: format!("{:.0}", chart_height - 8.0),
                    text_anchor: "middle",
                    font_size: "13",
                    fill: "var(--muted, #ccc)",
                    stroke: "none",
                    "{p.label}"
                }
            }
        }
    }
    .unwrap();

    let astronomy_section: Option<VNode> = data.forecast.first().map(|first_day| {
        let moon_phase = first_day
            .moon_phase_name
            .clone()
            .unwrap_or_else(|| "Unknown".to_string());
        let moon_emoji = moon_emoji_from_phase(&moon_phase);
        let moon_percent = first_day
            .moon_illumination
            .map(|v| format!("{:.0}%", v))
            .unwrap_or_else(na);
        let moon_illum_str = if lang == Language::English {
            format!("Illumination: {}", moon_percent)
        } else {
            format!("Освещённость: {}", moon_percent)
        };

        // Sunrise / sunset times (already formatted as HH:MM)
        let sunrise_time = format_time(first_day.sunrise.as_deref().unwrap_or("N/A"));
        let sunset_time = format_time(first_day.sunset.as_deref().unwrap_or("N/A"));

        // Day length using the correct HH:MM strings
        let day_length = if sunrise_time != "N/A" && sunset_time != "N/A" {
            day_length_approx(&sunrise_time, &sunset_time)
        } else {
            "N/A".to_string()
        };
        let day_length_str = if lang == Language::English {
            format!("Day length: {}", day_length)
        } else {
            format!("Длительность дня: {}", day_length)
        };

        // ---- Curve: M 20,100  Q 150,-120  280,100   (very tall, peaks at y = -70) ----
        // Horizon at y = 30
        // Intersection points computed from equation (same logic as before)
        let t_sunrise: f64 = 0.2643;
        let t_sunset: f64 = 0.7357;

        let x_for_t = |t: f64| -> f64 {
            (1.0 - t).powi(2) * 20.0 + 2.0 * (1.0 - t) * t * 150.0 + t.powi(2) * 280.0
        };
        let sunrise_x = x_for_t(t_sunrise);
        let sunset_x = x_for_t(t_sunset);

        // Current sun position
        let sun_pos: Option<(f64, f64)> = if sunrise_time != "N/A" && sunset_time != "N/A" {
            let to_min = |s: &str| -> i32 {
                let parts: Vec<&str> = s.split(':').collect();
                if parts.len() == 2 {
                    parts[0].parse::<i32>().unwrap_or(0) * 60 + parts[1].parse::<i32>().unwrap_or(0)
                } else {
                    0
                }
            };
            let rise_min = to_min(&sunrise_time);
            let set_min = to_min(&sunset_time);
            let now_str = Local::now().format("%H:%M").to_string();
            let now_min = to_min(&now_str);

            let t = if now_min < rise_min {
                let minutes_before = rise_min - now_min;
                let total_night = 1440 - (set_min - rise_min);
                let fraction = minutes_before as f64 / total_night as f64;
                t_sunrise - 0.5 * fraction
            } else if now_min > set_min {
                let minutes_after = now_min - set_min;
                let total_night = 1440 - (set_min - rise_min);
                let fraction = minutes_after as f64 / total_night as f64;
                t_sunset + 0.5 * fraction
            } else {
                t_sunrise
                    + (now_min - rise_min) as f64 / (set_min - rise_min) as f64
                        * (t_sunset - t_sunrise)
            };
            let t = t.max(-0.1).min(1.1);
            let x = x_for_t(t);
            let y = (1.0 - t).powi(2) * 100.0 + 2.0 * (1.0 - t) * t * (-120.0) + t.powi(2) * 100.0;
            Some((x, y))
        } else {
            None
        };

        let sunrise_label: String = if lang == Language::English {
            format!("Sunrise: {}", sunrise_time)
        } else {
            format!("Восход: {}", sunrise_time)
        };
        let sunset_label = if lang == Language::English {
            format!("Sunset: {}", sunset_time)
        } else {
            format!("Закат: {}", sunset_time)
        };

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
                        svg {
                            view_box: "0 -50 300 120",
                            width: "100%",
                            style: "display: block;",
                            // Horizon line at y = 30
                            line {
                                x1: "20",
                                y1: "30",
                                x2: "280",
                                y2: "30",
                                stroke: "var(--muted, #aaa)",
                                stroke_width: 2,
                                stroke_dasharray: "4 4",
                            }
                            // Tall curved sun path
                            path {
                                d: "M 20,100 Q 150,-120 280,100",
                                fill: "none",
                                stroke: "var(--accent, orange)",
                                stroke_width: 3,
                                stroke_linecap: "round",
                            }
                            text {
                                x: format!("{:.1}", sunrise_x),
                                y: "-30",
                                text_anchor: "middle",
                                font_size: "12",
                                fill: "var(--text)",
                                "{sunrise_label}"
                            }
                            text {
                                x: format!("{:.1}", sunset_x),
                                y: "-30",
                                text_anchor: "middle",
                                font_size: "12",
                                fill: "var(--text)",
                                "{sunset_label}"
                            }
                            // Sun emoji
                            if let Some((sun_x, sun_y)) = sun_pos {
                                text {
                                    x: format!("{:.1}", sun_x),
                                    y: format!("{:.1}", sun_y - 12.0),
                                    text_anchor: "middle",
                                    font_size: "28",
                                    fill: "var(--text)",
                                    "☀️"
                                }
                            }
                        }
                        p { style: "margin-top: 8px; font-size: 0.9rem; color: var(--muted);",
                            "{day_length_str}"
                        }
                    }
                    div { class: "astro-card",
                        p { style: "font-size: 3rem;", "{moon_emoji}" }
                        p { "{translate_moon_phase(&moon_phase, &lang)}" }
                        p { "{moon_illum_str}" }
                    }
                }
            }
        }
        .unwrap()
    });

    // Main layout
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
                        "Hourly Forecast (24h)"
                    } else {
                        "Почасовой прогноз (24ч)"
                    }
                }
                {hourly_chart}
            }
            div { class: "forecast-section glass-card",
                h3 {
                    if lang == Language::English {
                        "7-Day Forecast"
                    } else {
                        "Прогноз на 7 дней"
                    }
                }
                {daily_chart}
            }
            {astronomy_section}
        }
    }
}

fn day_length_approx(rise: &str, set: &str) -> String {
    let to_min = |t: &str| {
        let parts: Vec<&str> = t.split(':').collect();
        if parts.len() == 2 {
            let h: i32 = parts[0].parse().unwrap_or(0);
            let m: i32 = parts[1].parse().unwrap_or(0);
            h * 60 + m
        } else {
            0
        }
    };
    let rise_min = to_min(rise);
    let set_min = to_min(set);
    let diff = if set_min > rise_min {
        set_min - rise_min
    } else {
        1440 - rise_min + set_min
    };
    format!("{}h {}m", diff / 60, diff % 60)
}
