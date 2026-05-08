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
            (DownloadOs::MacOS, Language::English) => ".dmg for Mac (see instructions)",
            (DownloadOs::Linux, Language::English) => "from source (open-source)",
            (DownloadOs::Android, Language::Russian) => ".apk для Android",
            (DownloadOs::Windows, Language::Russian) => ".exe для Windows",
            (DownloadOs::MacOS, Language::Russian) => ".dmg для Mac",
            (DownloadOs::Linux, Language::Russian) => "из исходников (open-source)",
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

        let action_area: VNode = if selected() == DownloadOs::Linux {
            rsx! {
                div { style: "margin-top: 16px;",
                    p { style: "color: var(--muted); font-size: 0.9rem; text-align: center;",
                        if lang == Language::English {
                            "Install Rust, then run:"
                        } else {
                            "Установите Rust, затем выполните:"
                        }
                    }
                    div { style: "background: var(--input-bg); border-radius: 12px; border: 1px solid var(--border); padding: 12px 16px; margin-bottom: 8px;",
                        code { style: "color: var(--text); font-size: 0.85rem; word-break: break-all; user-select: all;",
                            "{install_rust_command}"
                        }
                    }
                    div { style: "background: var(--input-bg); border-radius: 12px; border: 1px solid var(--border); padding: 12px 16px;",
                        code { style: "color: var(--text); font-size: 0.85rem; word-break: break-all; user-select: all;",
                            "{install_app_command}"
                        }
                    }
                }
            }
            .unwrap()
        } else {
            rsx! {
                div {
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
                    // Mac instructions
                    if selected() == DownloadOs::MacOS {
                        div { style: "margin-top: 12px; padding: 12px; background: var(--input-bg); border-radius: 12px; border: 1px solid var(--border);",
                            p { style: "color: var(--muted); font-size: 0.85rem; margin: 0 0 8px 0; font-weight: 700;",
                                if lang == Language::English {
                                    "After downloading:"
                                } else {
                                    "После загрузки:"
                                }
                            }
                            p { style: "color: var(--text); font-size: 0.85rem; margin: 0 0 4px 0;",
                                if lang == Language::English {
                                    "1. Open YarikWeather-MacOS.dmg file, drag YarikWeather.app into applications folder"
                                } else {
                                    "1. Откройте YarikWeather-MacOS.dmg файл, перетащите YarikWeather.app в папку приложения"
                                }
                            }
                            p { style: "color: var(--text); font-size: 0.85rem; margin: 0 0 4px 0;",
                                if lang == Language::English {
                                    "2. Open Terminal"
                                } else {
                                    "2. Откройте Терминал"
                                }
                            }
                            p { style: "color: var(--text); font-size: 0.85rem; margin: 0 0 4px 0;",
                                if lang == Language::English {
                                    "3. Type: xattr -cr (space)"
                                } else {
                                    "3. Введите: xattr -cr (пробел)"
                                }
                            }
                            p { style: "color: var(--text); font-size: 0.85rem; margin: 0 0 4px 0;",
                                if lang == Language::English {
                                    "4. Drag the app into Terminal and press Enter"
                                } else {
                                    "4. Перетащите приложение в Терминал и нажмите Enter"
                                }
                            }
                            p { style: "color: var(--text); font-size: 0.85rem; margin: 0 0 4px 0;",
                                if lang == Language::English {
                                    "5. Now you can use it"
                                } else {
                                    "5. Теперь можно пользоваться"
                                }
                            }
                        }
                    }
                }
            }
            .unwrap()
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
                    {download_grid}
                    {action_area}
                }
            }
        }
    }
}

#[cfg(target_arch = "wasm32")]
pub use inner::*;
