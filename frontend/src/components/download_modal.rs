use crate::assets::ANDROID_ICON;
use crate::assets::LINUX_ICON;
use crate::assets::WINDOWS_ICON;
use crate::helpers::open_link;
use crate::settings::apple_icon;
use crate::settings::Language;
use crate::settings::Theme;

use dioxus::prelude::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DownloadOs {
    Android,
    Windows,
    MacOS,
    Linux,
}

pub fn download_label(os: DownloadOs, lang: &Language) -> &'static str {
    match (os, lang) {
        (DownloadOs::Android, Language::English) => "Android",
        (DownloadOs::Windows, Language::English) => "Windows",
        (DownloadOs::MacOS, Language::English) => "MacOS",
        (DownloadOs::Linux, Language::English) => "Linux",
        (DownloadOs::Android, Language::Russian) => "Android",
        (DownloadOs::Windows, Language::Russian) => "Windows",
        (DownloadOs::MacOS, Language::Russian) => "MacOS",
        (DownloadOs::Linux, Language::Russian) => "Linux",
    }
}

pub fn download_description(os: DownloadOs, lang: &Language) -> &'static str {
    match (os, lang) {
        (DownloadOs::Android, Language::English) => ".apk for Android",
        (DownloadOs::Windows, Language::English) => ".exe for PC",
        (DownloadOs::MacOS, Language::English) => ".dmg for Mac",
        (DownloadOs::Linux, Language::English) => ".deb for Linux",
        (DownloadOs::Android, Language::Russian) => ".apk для Android",
        (DownloadOs::Windows, Language::Russian) => ".exe для ПК",
        (DownloadOs::MacOS, Language::Russian) => ".dmg для Mac",
        (DownloadOs::Linux, Language::Russian) => ".deb для Linux",
    }
}

pub fn download_url(os: DownloadOs) -> &'static str {
    match os {
        DownloadOs::Android => "../../downloads/YarikWeather-Android.apk",
        DownloadOs::Windows => "../../downloads/YarikWeather-Windows.exe",
        DownloadOs::MacOS => "../../downloads/YarikWeather-MacOS.dmg",
        DownloadOs::Linux => "../../downloads/YarikWeather-Linux.deb",
    }
}

#[component]
pub fn DownloadModal(lang: Language, theme: Theme, on_close: EventHandler<()>) -> Element {
    let mut selected = use_signal(|| DownloadOs::Android);

    let oss = [
        DownloadOs::Android,
        DownloadOs::Windows,
        DownloadOs::MacOS,
        DownloadOs::Linux,
    ];

    let download_grid: VNode = rsx! {
        div { class: "download-grid",
            for os in oss.iter().copied() {
                {
                    let active = selected() == os;
                    let icon = match os {
                        DownloadOs::Android => ANDROID_ICON,
                        DownloadOs::Windows => WINDOWS_ICON,
                        DownloadOs::MacOS => apple_icon(theme),
                        DownloadOs::Linux => LINUX_ICON,
                    };
                    rsx! {
                        div {
                            class: if active { "download-card active" } else { "download-card" },
                            onclick: move |_| selected.set(os),
                            img { class: "download-card-icon", src: icon }
                            div { class: "download-card-title", "{download_label(os, &lang)}" }
                            div { class: "download-card-desc", "{download_description(os, &lang)}" }
                        }
                    }
                }
            }
        }
    }
    .unwrap();

    rsx! {
        div { class: "modal-overlay",
            div { class: "modal download-modal",
                div { class: "modal-topbar",
                    h2 {
                        if lang == Language::English {
                            "Downloads"
                        } else {
                            "Загрузки"
                        }
                    }
                    button {
                        class: "close-btn",
                        onclick: move |_| on_close.call(()),
                        "✖"
                    }
                }
                p { class: "modal-subtitle",
                    if lang == Language::English {
                        "Choose your platform and download the app."
                    } else {
                        "Выберите платформу и скачайте приложение."
                    }
                }
                {download_grid}
                button {
                    class: "primary-btn download-confirm-btn",
                    onclick: move |_| open_link(download_url(selected())),
                    if lang == Language::English {
                        "Download"
                    } else {
                        "Скачать"
                    }
                }
            }
        }
    }
}
