use crate::helpers::open_link;
use crate::settings::Language;
use crate::settings::PressureUnit;
use crate::settings::TempUnit;
use crate::settings::Theme;
use crate::settings::UserSettings;
use crate::settings::WindUnit;
use crate::settings::choice_btn_class;
use crate::settings::save_settings;

use dioxus::prelude::*;

#[component]
pub fn SettingsModal(
    settings: UserSettings,
    theme: Theme,
    on_save: EventHandler<UserSettings>,
    on_close: EventHandler<()>,
    on_change: EventHandler<UserSettings>,
) -> Element {
    let mut temp_settings = use_signal(|| settings.clone());
    let lang = temp_settings().language.clone();

    let notify_change = {
        let temp_settings = temp_settings.clone();
        let on_change = on_change.clone();
        move || on_change.call(temp_settings())
    };

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

                // Language
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
                            onclick: move |_| {
                                temp_settings.write().language = Language::English;
                                notify_change();
                            },
                            "English"
                        }
                        button {
                            class: choice_btn_class(temp_settings().language == Language::Russian),
                            onclick: move |_| {
                                temp_settings.write().language = Language::Russian;
                                notify_change();
                            },
                            "Русский"
                        }
                    }
                }

                // Temperature unit
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
                            onclick: move |_| {
                                temp_settings.write().temp_unit = TempUnit::Celsius;
                                notify_change();
                            },
                            if lang == Language::English {
                                "Celsius (°C)"
                            } else {
                                "Цельсий (°C)"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().temp_unit == TempUnit::Fahrenheit),
                            onclick: move |_| {
                                temp_settings.write().temp_unit = TempUnit::Fahrenheit;
                                notify_change();
                            },
                            if lang == Language::English {
                                "Fahrenheit (°F)"
                            } else {
                                "Фаренгейт (°F)"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().temp_unit == TempUnit::Kelvin),
                            onclick: move |_| {
                                temp_settings.write().temp_unit = TempUnit::Kelvin;
                                notify_change();
                            },
                            if lang == Language::English {
                                "Kelvin (K)"
                            } else {
                                "Кельвин (K)"
                            }
                        }
                    }
                }

                // Wind unit
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
                            onclick: move |_| {
                                temp_settings.write().wind_unit = WindUnit::Mps;
                                notify_change();
                            },
                            if lang == Language::English {
                                "m/s"
                            } else {
                                "м/с"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().wind_unit == WindUnit::Kmph),
                            onclick: move |_| {
                                temp_settings.write().wind_unit = WindUnit::Kmph;
                                notify_change();
                            },
                            if lang == Language::English {
                                "km/h"
                            } else {
                                "км/ч"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().wind_unit == WindUnit::Mph),
                            onclick: move |_| {
                                temp_settings.write().wind_unit = WindUnit::Mph;
                                notify_change();
                            },
                            if lang == Language::English {
                                "mph"
                            } else {
                                "миль/ч"
                            }
                        }
                    }
                }

                // Pressure unit
                div { class: "setting-row",
                    label {
                        if lang == Language::English {
                            "Pressure unit:"
                        } else {
                            "Единица давления:"
                        }
                    }
                    div { class: "choice-group",
                        button {
                            class: choice_btn_class(temp_settings().pressure_unit == PressureUnit::HPa),
                            onclick: move |_| {
                                temp_settings.write().pressure_unit = PressureUnit::HPa;
                                notify_change();
                            },
                            if lang == Language::English {
                                "hPa"
                            } else {
                                "гПа"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().pressure_unit == PressureUnit::MmHg),
                            onclick: move |_| {
                                temp_settings.write().pressure_unit = PressureUnit::MmHg;
                                notify_change();
                            },
                            if lang == Language::English {
                                "mmHg"
                            } else {
                                "мм. рт. ст."
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().pressure_unit == PressureUnit::InHg),
                            onclick: move |_| {
                                temp_settings.write().pressure_unit = PressureUnit::InHg;
                                notify_change();
                            },
                            if lang == Language::English {
                                "inHg"
                            } else {
                                "дюйм рт. ст."
                            }
                        }
                    }
                }

                // Theme
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
                            onclick: move |_| {
                                temp_settings.write().theme = Theme::Auto;
                                notify_change();
                            },
                            if lang == Language::English {
                                "Auto"
                            } else {
                                "Авто"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().theme == Theme::Light),
                            onclick: move |_| {
                                temp_settings.write().theme = Theme::Light;
                                notify_change();
                            },
                            if lang == Language::English {
                                "Light"
                            } else {
                                "Светлая"
                            }
                        }
                        button {
                            class: choice_btn_class(temp_settings().theme == Theme::Dark),
                            onclick: move |_| {
                                temp_settings.write().theme = Theme::Dark;
                                notify_change();
                            },
                            if lang == Language::English {
                                "Dark"
                            } else {
                                "Тёмная"
                            }
                        }
                    }
                }

                // Default city
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

                div { style: "margin-top: 24px; text-align: center; font-size: 0.85rem;",
                    span { style: format!("color: {};", if theme == Theme::Light { "#000000" } else { "#ffffff" }),
                        if lang == Language::English {
                            "Developed by "
                        } else {
                            "Разработано "
                        }
                    }
                    a {
                        href: "https://larfi44.github.io/Yarik-Studio.github.io/index.html",
                        target: "_blank",
                        style: "color: #4a9eff; text-decoration: none; font-weight: 600; cursor: pointer;",
                        "Yarik Studio"
                    }
                }

                div { style: "margin-top: 16px; display: flex; justify-content: center;",
                    a {
                        href: "https://pay.cloudtips.ru/p/b94e349b",
                        target: "_blank",
                        button {
                            class: "primary-btn",
                            style: "font-size: 0.9rem; padding: 10px 20px;",
                            if lang == Language::English {
                                "❤️ Donate"
                            } else {
                                "❤️ Пожертвовать"
                            }
                        }
                    }
                }
            }
        }
    }
}
