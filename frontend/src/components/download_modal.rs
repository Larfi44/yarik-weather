#[cfg(target_arch = "wasm32")]
mod inner {
    use crate::assets::ANDROID_ICON;
    use crate::assets::LINUX_ICON;
    use crate::assets::WINDOWS_ICON;
    use crate::settings::apple_icon;
    use crate::settings::Language;
    use crate::settings::Theme;
    use dioxus::prelude::*;
    use wasm_bindgen::JsCast;

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
            (DownloadOs::Windows, Language::English) => ".exe for Windows",
            (DownloadOs::MacOS, Language::English) => ".dmg for Mac (see below)",
            (DownloadOs::Linux, Language::English) => "from source (see below)",
            (DownloadOs::Android, Language::Russian) => ".apk для Android",
            (DownloadOs::Windows, Language::Russian) => ".exe для Windows",
            (DownloadOs::MacOS, Language::Russian) => ".dmg для Mac (инструкция ниже)",
            (DownloadOs::Linux, Language::Russian) => "из исходников (инструкция ниже)",
        }
    }

    pub fn download_url(os: DownloadOs) -> &'static str {
        match os {
            DownloadOs::Android => "/downloads/YarikWeather-Android.apk",
            DownloadOs::Windows => "/downloads/YarikWeather-Windows.exe",
            DownloadOs::MacOS => "/downloads/YarikWeather-MacOS.dmg",
            DownloadOs::Linux => "",
        }
    }

    pub fn download_file(url: &str, filename: &str) {
        use web_sys::{window, HtmlAnchorElement};

        if let Some(window) = window() {
            if let Some(document) = window.document() {
                if let Ok(a) = document.create_element("a") {
                    if let Ok(a) = a.dyn_into::<HtmlAnchorElement>() {
                        a.set_href(url);
                        a.set_download(filename);
                        if let Some(body) = document.body() {
                            let _ = body.append_child(&a);
                            a.click();
                            let _ = body.remove_child(&a);
                        }
                    }
                }
            }
        }
    }

    pub fn filename_from_url(url: &str) -> &str {
        url.rsplit('/').next().unwrap_or("download")
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

        let install_rust_command = "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh";
        let install_app_command =
            "cargo install --git https://github.com/Larfi44/yarik-weather --features desktop";

        // Scrollable area: cards + Linux instructions
        let scroll_content = rsx! {
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
            // Linux installation steps
            if selected() == DownloadOs::Linux {
                div { class: "linux-instructions",
                    div { class: "linux-step",
                        p { class: "linux-step-text",
                            if lang == Language::English {
                                "1. Install Rust"
                            } else {
                                "1. Установите Rust"
                            }
                        }
                        code { "{install_rust_command}" }
                    }
                    div { class: "linux-step",
                        p { class: "linux-step-text",
                            if lang == Language::English {
                                "2. Install Yarik Weather"
                            } else {
                                "2. Установите Yarik Weather"
                            }
                        }
                        code { "{install_app_command}" }
                    }
                }
            }
        };

        let bottom_content = rsx! {
            if selected() != DownloadOs::Linux {
                button {
                    class: "primary-btn download-confirm-btn",
                    onclick: move |_| {
                        let url = download_url(selected());
                        let filename = filename_from_url(url);
                        download_file(url, filename);
                    },
                    if lang == Language::English {
                        "Download"
                    } else {
                        "Скачать"
                    }
                }
            }
            // Mac specific instructions (visible only when MacOS is selected)
            if selected() == DownloadOs::MacOS {
                div { class: "mac-instructions",
                    p { class: "mac-instructions-title",
                        if lang == Language::English {
                            "After downloading:"
                        } else {
                            "После загрузки:"
                        }
                    }
                    p { class: "mac-instructions-step",
                        if lang == Language::English {
                            "1. Open the .dmg, drag the app to Applications"
                        } else {
                            "1. Откройте .dmg, перетащите приложение в Applications"
                        }
                    }
                    p { class: "mac-instructions-step",
                        if lang == Language::English {
                            "2. Open Terminal, type: xattr -cr"
                        } else {
                            "2. Откройте Терминал, введите: xattr -cr"
                        }
                    }
                    p { class: "mac-instructions-step",
                        if lang == Language::English {
                            "3. Drag the app into Terminal, press Enter"
                        } else {
                            "3. Перетащите приложение в Терминал, нажмите Enter"
                        }
                    }
                    p { class: "mac-instructions-step",
                        if lang == Language::English {
                            "4. Now you can use it"
                        } else {
                            "4. Теперь можно пользоваться"
                        }
                    }
                }
            }
        };

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
                    div { class: "download-scroll", {scroll_content} }
                    div { class: "download-actions", {bottom_content} }
                }
            }
        }
    }
}

#[cfg(target_arch = "wasm32")]
pub use inner::*;
