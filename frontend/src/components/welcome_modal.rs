use crate::settings::choice_btn_class;
use crate::settings::save_settings;
use crate::settings::Language;
use crate::settings::TempUnit;
use crate::settings::Theme;
use crate::settings::UserSettings;
use crate::settings::WindUnit;

use dioxus::prelude::*;

#[component]
pub fn WelcomeModal(
    on_complete: EventHandler<UserSettings>,
    on_change: EventHandler<UserSettings>,
) -> Element {
    let mut temp_settings = use_signal(UserSettings::default);
    let lang = temp_settings().language.clone();

    let notify_change = {
        let temp_settings = temp_settings.clone();
        let on_change = on_change.clone();
        move || on_change.call(temp_settings())
    };

    rsx! {
        div { class: "modal-overlay",
            div { class: "modal welcome-modal",
                h2 { display: "flex", justify_content: "center",
                    if lang == Language::English {
                        "Welcome to Yarik Weather!"
                    } else {
                        "Добро пожаловать в Yarik Weather!"
                    }
                }
                p { display: "flex", justify_content: "center",
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

                div { style: "display: flex; justify-content: center; margin-top: 20px;",
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
}
