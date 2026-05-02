use crate::settings::Language;
use crate::settings::TempUnit;
use crate::settings::WindUnit;

pub fn convert_temp(celsius: f64, unit: &TempUnit) -> f64 {
    match unit {
        TempUnit::Celsius => celsius,
        TempUnit::Fahrenheit => celsius * 9.0 / 5.0 + 32.0,
        TempUnit::Kelvin => celsius + 273.15,
    }
}

pub fn convert_wind(ms: f64, unit: &WindUnit) -> f64 {
    match unit {
        WindUnit::Mps => ms,
        WindUnit::Kmph => ms * 3.6,
        WindUnit::Mph => ms * 2.23694,
    }
}

pub fn format_time(iso_time: &str) -> String {
    if iso_time == "N/A" {
        return "N/A".to_string();
    }
    let time_part = iso_time.split('T').nth(1).unwrap_or(iso_time);
    time_part.chars().take(5).collect()
}

pub fn condition_icon_from_text(condition: &str) -> &'static str {
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

pub fn moon_emoji_from_phase(phase: &str) -> &'static str {
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

pub fn translate_moon_phase(phase: &str, lang: &Language) -> String {
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

pub fn translate_condition(condition_en: &str, lang: &Language) -> String {
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

pub fn format_forecast_label(date_str: &str, index: usize, lang: &Language) -> String {
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

pub fn month_name_en(month: u32) -> &'static str {
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

pub fn month_name_ru(month: u32) -> &'static str {
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

pub fn open_link(url: &str) {
    #[cfg(target_arch = "wasm32")]
    {
        use gloo_utils::window;
        let _ = window().open_with_url_and_target(url, "_blank");
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        // For desktop, we'll need to use a different approach
        // This is a placeholder - you might want to use a crate like "open" for desktop
        let _ = std::process::Command::new("open").arg(url).spawn();
    }
}
