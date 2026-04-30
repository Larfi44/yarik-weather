use crate::settings::get_settings;
use crate::settings::Language;

use dioxus::prelude::*;

#[component]
pub fn SearchBar(on_search: EventHandler<String>) -> Element {
    let mut city = use_signal(|| "".to_string());
    let lang = get_settings().language;
    rsx! {
        div { class: "search-container",
            input {
                class: "city-input",
                placeholder: if lang == Language::English { "Enter city name..." } else { "Введите название города..." },
                value: city(),
                oninput: move |e| city.set(e.value()),
                onkeydown: move |event| {
                    if event.key() == Key::Enter {
                        let trimmed = city().trim().to_string();
                        if !trimmed.is_empty() {
                            on_search.call(trimmed);
                        }
                    }
                },
            }
            button {
                class: "search-btn",
                onclick: move |_| {
                    let trimmed = city().trim().to_string();
                    if !trimmed.is_empty() {
                        on_search.call(trimmed);
                    }
                },
                if lang == Language::English {
                    "Search"
                } else {
                    "Поиск"
                }
            }
        }
    }
}
