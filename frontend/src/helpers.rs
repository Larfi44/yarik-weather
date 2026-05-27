use crate::settings::Language;
use crate::settings::PressureUnit;
use crate::settings::TempUnit;
use crate::settings::WindUnit;

#[cfg(target_arch = "wasm32")]
use {js_sys, wasm_bindgen::JsCast, web_sys::window};

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
        if let Some(window) = window() {
            // Try Tauri opener plugin (Android)
            if let Ok(tauri) = js_sys::Reflect::get(&window, &"__TAURI__".into()) {
                if let Ok(invoke_js) = js_sys::Reflect::get(&tauri, &"invoke".into()) {
                    if let Some(invoke) = invoke_js.dyn_ref::<js_sys::Function>() {
                        let args = js_sys::Object::new();
                        js_sys::Reflect::set(&args, &"url".into(), &url.into()).ok();
                        let _ = invoke.call2(&tauri, &"plugin:opener|open_url".into(), &args);
                        return;
                    }
                }
            }
            // Fallback: open in regular browser
            let _ = window.open_with_url_and_target(url, "_blank");
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        // Desktop fallback
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("open").arg(url).spawn();
        }
        #[cfg(target_os = "linux")]
        {
            let _ = std::process::Command::new("xdg-open").arg(url).spawn();
        }
        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("cmd")
                .args(&["/C", "start", url])
                .spawn();
        }
    }
}

pub fn convert_pressure(hpa: f64, unit: &PressureUnit) -> f64 {
    match unit {
        PressureUnit::HPa => hpa,
        PressureUnit::MmHg => hpa * 0.750062,
        PressureUnit::InHg => hpa * 0.02953,
    }
}

pub fn uv_category(uv: f64) -> &'static str {
    if uv < 3.0 {
        "Low"
    } else if uv < 6.0 {
        "Moderate"
    } else if uv < 8.0 {
        "High"
    } else if uv < 11.0 {
        "Very High"
    } else {
        "Extreme"
    }
}

pub fn pressure_category(hpa: f64) -> &'static str {
    if hpa < 980.0 {
        "Low"
    } else if hpa < 1010.0 {
        "Normal"
    } else if hpa < 1040.0 {
        "High"
    } else {
        "Very High"
    }
}

pub fn wind_category(ms: f64) -> &'static str {
    if ms < 0.5 {
        "Calm"
    } else if ms < 5.5 {
        "Light"
    } else if ms < 8.0 {
        "Moderate"
    } else if ms < 10.8 {
        "Fresh"
    } else if ms < 13.9 {
        "Strong"
    } else {
        "Storm"
    }
}

pub fn translate_category(cat: &str, lang: &Language) -> String {
    if *lang == Language::English {
        return cat.to_string();
    }
    match cat {
        "Low" => "Низкий".into(),
        "Moderate" => "Средний".into(),
        "High" => "Высокий".into(),
        "Very High" => "Очень высокий".into(),
        "Extreme" => "Экстремальный".into(),
        "Comfortable" => "Комфортная".into(),
        "Normal" => "Нормальное".into(),
        "Calm" => "Штиль".into(),
        "Light" => "Лёгкий".into(),
        "Fresh" => "Средний".into(),
        "Strong" => "Сильный".into(),
        "Storm" => "Шторм".into(),
        _ => cat.to_string(),
    }
}

// English names (language=en)
const COASTAL_CITIES_EN: &[&str] = &[
    // Russia (50)
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
    // Crimea (15)
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
    // World (50)
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
    "Odessa",
    "Odesa",
];

const COASTAL_CITIES_RU: &[&str] = &[
    // Russia (50)
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
    // Crimea (15)
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
    "Мариуполь",
    // World (50)
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
    "Одесса",
];

/// Returns true if the city is known to be coastal (checks both English and Russian names).
pub fn is_coastal_city(city: &str) -> bool {
    COASTAL_CITIES_EN
        .iter()
        .any(|c| c.eq_ignore_ascii_case(city))
        || COASTAL_CITIES_RU
            .iter()
            .any(|c| c.to_lowercase() == city.to_lowercase())
}

pub fn get_approx_lat(city: &str) -> f64 {
    match city.to_lowercase().as_str() {
        "moscow" => 55.75,
        "london" => 51.51,
        "sochi" => 43.59,
        "vladivostok" => 43.13,
        "saint petersburg" | "st. petersburg" => 59.93,
        _ => 50.0,
    }
}

pub fn get_approx_lon(city: &str) -> f64 {
    match city.to_lowercase().as_str() {
        "moscow" => 37.61,
        "london" => -0.13,
        "sochi" => 39.72,
        "vladivostok" => 131.89,
        "saint petersburg" | "st. petersburg" => 30.34,
        _ => 10.0,
    }
}

// ─────────────────────────────────────────────────
//  Widget helpers – Android WebView only
// ─────────────────────────────────────────────────

#[cfg(target_arch = "wasm32")]
mod widget {
    use super::condition_icon_from_text;
    use js_sys::{Array, Object};
    use serde_json::json;
    use wasm_bindgen::{JsCast, JsValue};
    use wasm_bindgen_futures::JsFuture;
    use web_sys::{console, window};

    /// Helper to invoke a Tauri plugin command and log errors.
    async fn tauri_invoke(cmd: &str, args: &JsValue) -> Result<JsValue, JsValue> {
        let window = window().ok_or("no window")?;
        let tauri = js_sys::Reflect::get(&window, &"__TAURI__".into())?;
        let invoke_js = js_sys::Reflect::get(&tauri, &"invoke".into())?;
        let invoke = invoke_js
            .dyn_into::<js_sys::Function>()
            .map_err(|_| "invoke is not a function")?;
        let promise = js_sys::Reflect::apply(&invoke, &tauri, &Array::of2(&cmd.into(), args))?;
        let future = JsFuture::from(js_sys::Promise::from(promise));
        future.await
    }

    /// Log a message to the browser / Android logcat.
    fn log(msg: &str) {
        console::log_1(&format!("[Widget] {}", msg).into());
    }

    pub async fn update_weather_widget(
        city: &str,
        temp: f64,
        condition: &str,
        pressure: f64,
        forecast_high: f64,
        forecast_low: f64,
        forecast_cond: &str,
    ) {
        let emoji = condition_icon_from_text(condition);
        let forecast_emoji = condition_icon_from_text(forecast_cond);

        let config = json!({
            "small": {
                "type": "vstack",
                "properties": {
                    "alignment": "center",
                    "padding": 12,
                    "background": { "light": "#E8F4FD", "dark": "#1a1a2e" },
                    "cornerRadius": 16,
                    "spacing": 2
                },
                "children": [
                    { "type": "text", "properties": { "text": city, "textStyle": "caption1", "color": "secondaryLabel" } },
                    { "type": "text", "properties": { "text": format!("{:.0}°", temp), "textStyle": "largeTitle", "fontWeight": "bold", "color": "label" } }
                ]
            },
            "medium": {
                "type": "hstack",
                "properties": {
                    "alignment": "center",
                    "padding": 14,
                    "background": { "light": "#E8F4FD", "dark": "#1a1a2e" },
                    "cornerRadius": 20,
                    "spacing": 10
                },
                "children": [
                    {
                        "type": "vstack",
                        "properties": { "alignment": "center", "spacing": 4 },
                        "children": [
                            { "type": "text", "properties": { "text": emoji, "textStyle": "title1" } },
                            { "type": "text", "properties": { "text": city, "textStyle": "caption1", "color": "secondaryLabel" } }
                        ]
                    },
                    {
                        "type": "vstack",
                        "properties": { "alignment": "center", "spacing": 2 },
                        "children": [
                            { "type": "text", "properties": { "text": format!("{:.0}°", temp), "textStyle": "largeTitle", "fontWeight": "bold", "color": "label" } },
                            { "type": "text", "properties": { "text": format!("{:.0} hPa", pressure), "textStyle": "caption2", "color": "tertiaryLabel" } }
                        ]
                    }
                ]
            },
            "large": {
                "type": "vstack",
                "properties": {
                    "alignment": "leading",
                    "padding": 16,
                    "background": { "light": "#E8F4FD", "dark": "#1a1a2e" },
                    "cornerRadius": 24,
                    "spacing": 6
                },
                "children": [
                    {
                        "type": "hstack",
                        "properties": { "alignment": "center", "spacing": 12 },
                        "children": [
                            { "type": "text", "properties": { "text": emoji, "textStyle": "largeTitle" } },
                            {
                                "type": "vstack",
                                "properties": { "alignment": "leading", "spacing": 0 },
                                "children": [
                                    { "type": "text", "properties": { "text": city, "textStyle": "headline", "fontWeight": "semibold", "color": "label" } },
                                    { "type": "text", "properties": { "text": condition, "textStyle": "footnote", "color": "secondaryLabel" } }
                                ]
                            },
                            { "type": "spacer", "properties": {} },
                            { "type": "text", "properties": { "text": format!("{:.0}°", temp), "textStyle": "largeTitle", "fontWeight": "bold", "color": "label" } }
                        ]
                    },
                    { "type": "divider", "properties": {} },
                    {
                        "type": "hstack",
                        "properties": { "alignment": "center", "spacing": 8 },
                        "children": [
                            { "type": "text", "properties": { "text": "Pressure", "textStyle": "footnote", "fontWeight": "medium", "color": "secondaryLabel" } },
                            { "type": "spacer", "properties": {} },
                            { "type": "text", "properties": { "text": format!("{:.0} hPa", pressure), "textStyle": "footnote", "fontWeight": "medium", "color": "label" } }
                        ]
                    },
                    { "type": "divider", "properties": {} },
                    {
                        "type": "hstack",
                        "properties": { "alignment": "center", "spacing": 8 },
                        "children": [
                            { "type": "text", "properties": { "text": "Tomorrow", "textStyle": "footnote", "fontWeight": "semibold", "color": "secondaryLabel" } },
                            { "type": "text", "properties": { "text": forecast_emoji, "textStyle": "footnote" } },
                            { "type": "spacer", "properties": {} },
                            { "type": "text", "properties": { "text": format!("H:{:.0}°  L:{:.0}°", forecast_high, forecast_low), "textStyle": "footnote", "fontWeight": "medium", "color": "label" } }
                        ]
                    }
                ]
            }
        });

        // ── 1. Set the widget configuration (config MUST be a JSON string) ──
        let config_str = serde_json::to_string(&config).unwrap();
        log(&format!("Setting config: {}", config_str));

        let set_args = Object::new();
        js_sys::Reflect::set(&set_args, &"key".into(), &"weatherWidgetData".into()).unwrap();
        js_sys::Reflect::set(&set_args, &"config".into(), &JsValue::from_str(&config_str)).unwrap();

        if let Err(e) = tauri_invoke("plugin:widgets|set_widget_config", &set_args).await {
            log(&format!("set_widget_config failed: {:?}", e));
        } else {
            log("Widget config sent successfully");
        }

        // ── 2. Set a refresh interval so the widget stays updated ──
        let interval_secs = 30 * 60u64; // 30 minutes
        let refresh_args = Object::new();
        js_sys::Reflect::set(
            &refresh_args,
            &"interval".into(),
            &JsValue::from_f64(interval_secs as f64),
        )
        .unwrap();
        if let Err(e) =
            tauri_invoke("plugin:widgets|set_widget_refresh_interval", &refresh_args).await
        {
            log(&format!("set_widget_refresh_interval failed: {:?}", e));
        }
    }
}

#[cfg(target_arch = "wasm32")]
pub use widget::update_weather_widget;
