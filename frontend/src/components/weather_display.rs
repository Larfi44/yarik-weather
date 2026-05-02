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
use crate::types::HourlyData;
use crate::types::WeatherResponse;

use chrono::Local;
use dioxus::prelude::*;

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

    // ---- Hourly: yesterday → day 5 ----
    let mut selected_hourly_day = use_signal(|| 1_i32); // Default to today (index 1)

    // Group by date, including yesterday and today
    let mut hourly_by_day: Vec<Vec<&HourlyData>> = Vec::new();

    // Add yesterday's data first
    let yesterday_date = data.yesterday.date.clone();
    let yesterday_data: Vec<HourlyData> = data
        .hourly
        .iter()
        .filter(|h| h.date == yesterday_date)
        .cloned()
        .collect();
    if !yesterday_data.is_empty() {
        hourly_by_day.push(yesterday_data.iter().collect());
    }

    // Then group the remaining data by date
    let mut groups: Vec<Vec<&HourlyData>> = Vec::new();
    let mut current_date: Option<&str> = None;
    let mut current_group = Vec::new();
    for h in &data.hourly {
        // Skip hours that belong to yesterday since we've already added them
        if h.date == yesterday_date {
            continue;
        }

        match current_date {
            Some(d) if d == h.date => {}
            _ => {
                if !current_group.is_empty() {
                    groups.push(current_group);
                }
                current_group = Vec::new();
                current_date = Some(&h.date);
            }
        }
        current_group.push(h);
    }
    if !current_group.is_empty() {
        groups.push(current_group);
    }

    // Add today and future days, limiting to 6 days total (yesterday + 5 future days)
    for group in groups {
        hourly_by_day.push(group);
    }
    hourly_by_day.truncate(6);

    let day_labels: Vec<String> = (0..6)
        .map(|i| match i {
            0 => {
                if lang == Language::English {
                    "Yesterday".to_string()
                } else {
                    "Вчера".to_string()
                }
            }
            1 => {
                if lang == Language::English {
                    "Today".to_string()
                } else {
                    "Сегодня".to_string()
                }
            }
            2 => {
                if lang == Language::English {
                    "Tomorrow".to_string()
                } else {
                    "Завтра".to_string()
                }
            }
            3 => {
                if lang == Language::English {
                    "In 2 days".to_string()
                } else {
                    "Послезавтра".to_string()
                }
            }
            4 => {
                if lang == Language::English {
                    "In 3 days".to_string()
                } else {
                    "Через 3 дня".to_string()
                }
            }
            5 => {
                if lang == Language::English {
                    "In 4 days".to_string()
                } else {
                    "Через 4 дня".to_string()
                }
            }
            _ => format!("+{}d", i + 1),
        })
        .collect();

    let selected_day = selected_hourly_day() as usize;
    let displayed_hours: Vec<&HourlyData> =
        hourly_by_day.get(selected_day).cloned().unwrap_or_default();

    // ---- Hourly chart data ----
    // ---- Hourly chart data ----
    let h_min_temp = displayed_hours
        .iter()
        .map(|h| h.temperature)
        .fold(f64::INFINITY, f64::min);
    let h_max_temp = displayed_hours
        .iter()
        .map(|h| h.temperature)
        .fold(f64::NEG_INFINITY, f64::max);
    let h_temp_range = (h_max_temp - h_min_temp).max(0.1);

    let h_view_height: f64 = 300.0;
    let h_padding: f64 = 60.0;
    let h_plot_height: f64 = h_view_height - 2.0 * h_padding;

    // Determine spacing and total width dynamically
    let h_step_x: f64 = if displayed_hours.len() > 1 {
        // Make each point occupy a fixed comfortable width, e.g. 70 px
        70.0
    } else {
        0.0
    };
    // Total SVG width = left padding + points * step + right padding
    let h_svg_width: f64 = if displayed_hours.len() < 2 {
        300.0 // fallback
    } else {
        h_padding + h_step_x * (displayed_hours.len() - 1) as f64 + h_padding
    };

    let h_to_y = |t: f64| -> f64 {
        h_view_height - h_padding - ((t - h_min_temp) / h_temp_range) * h_plot_height
    };

    let h_points_line: Vec<String> = displayed_hours
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

    // Data for each point (owned)
    struct HourlyPointOwned {
        index: usize,
        x: f64,
        y: f64,
        icon: &'static str,
        temp_str: String,
        time_str: String,
    }

    let h_points: Vec<HourlyPointOwned> = displayed_hours
        .iter()
        .enumerate()
        .map(|(i, h)| {
            let x = h_padding + h_step_x * i as f64;
            let y = h_to_y(h.temperature);
            let icon = condition_icon_from_text(&h.condition);
            let temp_str = format!("{:.0}{}", h.temperature, temp_unit_str);
            let time_str = h.time.clone();
            HourlyPointOwned {
                index: i,
                x,
                y,
                icon,
                temp_str,
                time_str,
            }
        })
        .collect();

    let mut h_hovered = use_signal(|| None::<usize>);

    // Build hourly SVG children outside rsx! to avoid any borrows
    let hourly_svg_children: Vec<VNode> = {
        let mut children = Vec::new();
        for p in &h_points {
            let idx = p.index;
            let x = p.x;
            let y = p.y;
            let icon = p.icon;
            let temp_str = p.temp_str.clone();
            let time_str = p.time_str.clone();

            // circle
            children.push(
                rsx! {
                    circle {
                        cx: format!("{:.1}", x),
                        cy: format!("{:.1}", y),
                        r: if h_hovered() == Some(idx) { 7 } else { 5 },
                        fill: max_line_color,
                        stroke: "white",
                        stroke_width: 1.5,
                        class: "chart-point",
                        onmouseenter: move |_| h_hovered.set(Some(idx)),
                        onmouseleave: move |_| h_hovered.set(None),
                    }
                }
                .unwrap(),
            );

            // icon text
            children.push(
                rsx! {
                    text {
                        x: format!("{:.1}", x),
                        y: format!("{:.1}", y - 34.0),
                        text_anchor: "middle",
                        font_size: "20",
                        fill: "white",
                        stroke: "none",
                        "{icon}"
                    }
                }
                .unwrap(),
            );

            // temperature text
            children.push(
                rsx! {
                    text {
                        x: format!("{:.1}", x),
                        y: format!("{:.1}", y - 16.0),
                        text_anchor: "middle",
                        font_size: "12",
                        fill: label_color,
                        stroke: "none",
                        "{temp_str}"
                    }
                }
                .unwrap(),
            );

            // time text
            children.push(
                rsx! {
                    text {
                        x: format!("{:.1}", x),
                        y: format!("{:.0}", h_view_height - 8.0),
                        text_anchor: "middle",
                        font_size: "12",
                        fill: "var(--muted, #ccc)",
                        stroke: "none",
                        "{time_str}"
                    }
                }
                .unwrap(),
            );
        }
        children
    };

    // Precompute tooltip VNode
    let hourly_tooltip: Option<VNode> = h_hovered().and_then(|idx| {
        let displayed_hour = displayed_hours.get(idx)?;
        let p = h_points.get(idx)?;
        let cond_text = translate_condition(&displayed_hour.condition, &lang);
        let wind_str = format!(
            "{}: {:.1} {}",
            if lang == Language::English {
                "Wind"
            } else {
                "Ветер"
            },
            displayed_hour.wind_speed,
            wind_unit_str,
        );
        let tooltip_width = 130.0;
        let half_width = tooltip_width / 2.0;
        let x_ratio = p.x / h_svg_width;
        let offset = (x_ratio - 0.5) * 60.0;
        let tooltip_x = (p.x - half_width + offset)
            .max(0.0)
            .min(h_svg_width - tooltip_width);
        Some(
            rsx! {
                foreignObject {
                    x: format!("{:.1}", tooltip_x),
                    y: format!("{:.1}", p.y - 100.0),
                    width: format!("{:.0}", tooltip_width),
                    height: "90",
                    div { class: "chart-tooltip",
                        div { "{p.icon}  {cond_text}" }
                        div { "{p.temp_str}" }
                        div { "{wind_str}" }
                    }
                }
            }
            .unwrap(),
        )
    });

    let hourly_chart: VNode = rsx! {
        svg {
            view_box: format!("0 0 {:.0} {:.0}", h_svg_width, h_view_height),
            width: "{h_svg_width}px",
            style: "display: block; overflow: visible;",
            polyline {
                fill: "none",
                stroke: max_line_color,
                stroke_width: 2.5,
                stroke_linejoin: "round",
                stroke_linecap: "round",
                points: h_points_line.join(" "),
            }
            for child in hourly_svg_children {
                {child}
            }
            {hourly_tooltip}
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

    let chart_height: f64 = 300.0;
    let padding: f64 = 60.0;
    let plot_height: f64 = chart_height - 2.0 * padding;

    // Fixed spacing between days (feel free to adjust 100 px)
    let step_x: f64 = if chart_days.len() > 1 { 100.0 } else { 0.0 };
    // Total width
    let d_svg_width: f64 = if chart_days.len() < 2 {
        300.0
    } else {
        padding + step_x * (chart_days.len() - 1) as f64 + padding
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

    struct DailyPointOwned {
        index: usize,
        x: f64,
        y_max: f64,
        y_min: f64,
        icon: &'static str,
        max_temp_str: String,
        min_temp_str: String,
        label: String,
        condition: String,
        max_temp: f64,
        min_temp: f64,
        wind: f64,
    }

    let d_points: Vec<DailyPointOwned> = chart_days
        .iter()
        .enumerate()
        .map(|(i, day)| {
            let x = padding + step_x * i as f64;
            let y_max = to_y(day.temperature_max);
            let y_min = to_y(day.temperature_min);
            let icon = condition_icon_from_text(&day.condition);
            let label = if i == 0 {
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
            DailyPointOwned {
                index: i,
                x,
                y_max,
                y_min,
                icon,
                max_temp_str,
                min_temp_str,
                label,
                condition: day.condition.clone(),
                max_temp: day.temperature_max,
                min_temp: day.temperature_min,
                wind: day.wind_speed_max,
            }
        })
        .collect();

    let mut d_hovered = use_signal(|| None::<usize>);

    // Daily SVG children
    let daily_svg_children: Vec<VNode> = {
        let mut children = Vec::new();
        for p in &d_points {
            let idx = p.index;
            let x = p.x;
            let y_max = p.y_max;
            let y_min = p.y_min;
            let icon = p.icon;
            let max_temp_str = p.max_temp_str.clone();
            let min_temp_str = p.min_temp_str.clone();
            let label = p.label.clone();

            // max circle
            children.push(
                rsx! {
                    circle {
                        cx: format!("{:.1}", x),
                        cy: format!("{:.1}", y_max),
                        r: if d_hovered() == Some(idx) { 7 } else { 5 },
                        fill: point_fill_max,
                        stroke: "white",
                        stroke_opacity: if theme == Theme::Light { 1.0 } else { 0.0 },
                        stroke_width: 1.5,
                        class: "chart-point",
                        onmouseenter: move |_| d_hovered.set(Some(idx)),
                        onmouseleave: move |_| d_hovered.set(None),
                    }
                }
                .unwrap(),
            );

            // min circle
            children.push(
                rsx! {
                    circle {
                        cx: format!("{:.1}", x),
                        cy: format!("{:.1}", y_min),
                        r: if d_hovered() == Some(idx) { 7 } else { 5 },
                        fill: point_fill_min,
                        stroke: "white",
                        stroke_opacity: if theme == Theme::Light { 1.0 } else { 0.0 },
                        stroke_width: 1.5,
                        class: "chart-point",
                        onmouseenter: move |_| d_hovered.set(Some(idx)),
                        onmouseleave: move |_| d_hovered.set(None),
                    }
                }
                .unwrap(),
            );

            // max temp text
            children.push(
                rsx! {
                    text {
                        x: format!("{:.1}", x),
                        y: format!("{:.1}", y_max - 16.0),
                        text_anchor: "middle",
                        font_size: "12",
                        fill: max_line_color,
                        stroke: "none",
                        "{max_temp_str}"
                    }
                }
                .unwrap(),
            );

            // min temp text
            children.push(
                rsx! {
                    text {
                        x: format!("{:.1}", x),
                        y: format!("{:.1}", y_min + 22.0),
                        text_anchor: "middle",
                        font_size: "12",
                        fill: min_line_color,
                        stroke: "none",
                        "{min_temp_str}"
                    }
                }
                .unwrap(),
            );

            // icon text
            children.push(
                rsx! {
                    text {
                        x: format!("{:.1}", x),
                        y: format!("{:.1}", y_max - 34.0),
                        text_anchor: "middle",
                        font_size: "22",
                        fill: "white",
                        stroke: "none",
                        "{icon}"
                    }
                }
                .unwrap(),
            );

            // label text
            children.push(
                rsx! {
                    text {
                        x: format!("{:.1}", x),
                        y: format!("{:.0}", chart_height - 8.0),
                        text_anchor: "middle",
                        font_size: "13",
                        fill: "var(--muted, #ccc)",
                        stroke: "none",
                        "{label}"
                    }
                }
                .unwrap(),
            );
        }
        children
    };

    let daily_tooltip: Option<VNode> = d_hovered().and_then(|idx| {
        let day = chart_days.get(idx)?;
        let p = d_points.get(idx)?;
        let cond_text = translate_condition(&day.condition, &lang);
        let high_label = if lang == Language::English {
            "Highest"
        } else {
            "Макс"
        };
        let low_label = if lang == Language::English {
            "Lowest"
        } else {
            "Мин"
        };
        let high = format!(
            "{}: {:.0}{}",
            high_label, day.temperature_max, temp_unit_str
        );
        let low = format!("{}: {:.0}{}", low_label, day.temperature_min, temp_unit_str);
        let wind = format!(
            "{}: {:.1} {}",
            if lang == Language::English {
                "Wind"
            } else {
                "Ветер"
            },
            day.wind_speed_max,
            wind_unit_str,
        );
        let tooltip_width = 140.0;
        let half_width = tooltip_width / 2.0;
        let x_ratio = p.x / d_svg_width;
        let offset = (x_ratio - 0.5) * 60.0;
        let tooltip_x = (p.x - half_width + offset)
            .max(0.0)
            .min(d_svg_width - tooltip_width);
        Some(
            rsx! {
                foreignObject {
                    x: format!("{:.1}", tooltip_x),
                    y: format!("{:.1}", p.y_max - 100.0),
                    width: format!("{:.0}", tooltip_width),
                    height: "100",
                    div { class: "chart-tooltip",
                        div { "{p.icon}  {cond_text}" }
                        div { "{high}" }
                        div { "{low}" }
                        div { "{wind}" }
                    }
                }
            }
            .unwrap(),
        )
    });

    let daily_chart: VNode = rsx! {
        svg {
            view_box: format!("0 0 {:.0} {:.0}", d_svg_width, chart_height),
            width: "{d_svg_width}px",
            style: "display: block; overflow: visible;",
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
            for child in daily_svg_children {
                {child}
            }
            {daily_tooltip}
        }
    }
    .unwrap();

    // ---- Astronomy section (unchanged) ----
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

        let sunrise_time = format_time(first_day.sunrise.as_deref().unwrap_or("N/A"));
        let sunset_time = format_time(first_day.sunset.as_deref().unwrap_or("N/A"));

        let day_length_raw = if sunrise_time != "N/A" && sunset_time != "N/A" {
            day_length_approx(&sunrise_time, &sunset_time)
        } else {
            "N/A".to_string()
        };
        let day_length_str = if lang == Language::English {
            format!("Day length: {}", day_length_raw)
        } else {
            let localized = day_length_raw.replace("h", "ч").replace("m", "мин");
            format!("Длительность дня: {}", localized)
        };

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
        let t_sunrise = rise_min as f64 / 1440.0;
        let t_sunset = set_min as f64 / 1440.0;

        let y0 = 100.0;
        let y1 = 100.0;
        let y_horizon = 30.0;
        let yc = (y_horizon - (1.0 - t_sunrise).powi(2) * y0 - t_sunrise.powi(2) * y1)
            / (2.0 * (1.0 - t_sunrise) * t_sunrise);

        let x_for_t = |t: f64| -> f64 {
            (1.0 - t).powi(2) * 20.0 + 2.0 * (1.0 - t) * t * 150.0 + t.powi(2) * 280.0
        };
        let y_for_t =
            |t: f64| -> f64 { (1.0 - t).powi(2) * y0 + 2.0 * (1.0 - t) * t * yc + t.powi(2) * y1 };
        let sunrise_x: f64 = x_for_t(t_sunrise);
        let sunset_x: f64 = x_for_t(t_sunset);

        let sun_pos: Option<(f64, f64)> = if sunrise_time != "N/A" && sunset_time != "N/A" {
            let now_str: String = Local::now().format("%H:%M").to_string();
            let now_min: i32 = to_min(&now_str);
            let t: f64 = if now_min >= rise_min && now_min <= set_min {
                let fraction: f64 = (now_min - rise_min) as f64 / (set_min - rise_min) as f64;
                t_sunrise + fraction * (t_sunset - t_sunrise)
            } else {
                let total_night = 1440 - (set_min - rise_min);
                if now_min < rise_min {
                    let minutes_before = rise_min - now_min;
                    let fraction = minutes_before as f64 / total_night as f64;
                    t_sunrise - 0.6 * fraction
                } else {
                    let minutes_after = now_min - set_min;
                    let fraction = minutes_after as f64 / total_night as f64;
                    t_sunset + 0.6 * fraction
                }
            };
            let t: f64 = t.max(-0.2).min(1.2);
            let x: f64 = x_for_t(t);
            let y: f64 = y_for_t(t);
            Some((x, y))
        } else {
            None
        };

        let sunrise_label = if lang == Language::English {
            format!("Sunrise: {}", sunrise_time)
        } else {
            format!("Восход: {}", sunrise_time)
        };
        let sunset_label = if lang == Language::English {
            format!("Sunset: {}", sunset_time)
        } else {
            format!("Закат: {}", sunset_time)
        };
        let path_d = format!("M 20,100 Q 150,{:.1} 280,100", yc);

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
                            view_box: "0 -60 300 130",
                            width: "100%",
                            style: "display: block;",
                            line {
                                x1: "20",
                                y1: "30",
                                x2: "280",
                                y2: "30",
                                stroke: "var(--muted, #aaa)",
                                stroke_width: 2,
                                stroke_dasharray: "4 4",
                            }
                            path {
                                d: "{path_d}",
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

    let hourly_title = if lang == Language::English {
        format!("Hourly Forecast for {}", day_labels[selected_day])
    } else {
        format!("Почасовой прогноз на {}", day_labels[selected_day])
    };

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
                // Fixed header (doesn’t scroll)
                div { class: "hourly-header",
                    div { style: "display: flex; align-items: center; gap: 12px; margin: 0 auto;",
                        h3 { "{hourly_title}" }
                        div { class: "hourly-nav",
                            button {
                                class: "icon-btn",
                                disabled: selected_hourly_day() == 0,
                                onclick: move |_| {
                                    if selected_hourly_day() > 0 {
                                        selected_hourly_day -= 1;
                                    }
                                },
                                "◀"
                            }
                            button {
                                class: "icon-btn",
                                disabled: selected_hourly_day() == 5,
                                onclick: move |_| {
                                    if selected_hourly_day() < 5 {
                                        selected_hourly_day += 1;
                                    }
                                },
                                "▶"
                            }
                        }
                    }
                }
                // Scrollable chart goes into its own wrapper
                div { class: "chart-scroll", {hourly_chart} }
            }
            div { class: "forecast-section glass-card",
                h3 {
                    if lang == Language::English {
                        "7-Day Forecast"
                    } else {
                        "Прогноз на 7 дней"
                    }
                }
                div { class: "chart-scroll", {daily_chart} }
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
