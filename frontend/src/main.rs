mod api;
mod app;
mod assets;
mod components;
mod helpers;
mod settings;
mod types;

#[cfg(target_os = "android")]
use log;

use crate::app::App;

#[cfg(target_os = "android")]
use std::panic;

#[cfg(target_os = "android")]
fn setup_crash_handler() {
    panic::set_hook(Box::new(|info| {
        let msg = format!("Crash: {:?}", info);
        // Write to file (internal app storage – not user‑accessible, but works)
        let path =
            std::path::PathBuf::from("/data/data/com.YarikStudio.YarikWeather/files/crash.txt");
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&path, &msg);
        // Also print to logcat (you can see this with Logcat Reader)
        android_logger::init_once(
            android_logger::Config::default().with_max_level(log::LevelFilter::Error),
        );
        log::error!("{}", msg);
    }));
}

fn main() {
    #[cfg(target_os = "android")]
    setup_crash_handler();

    // Desktop
    #[cfg(feature = "desktop")]
    {
        use dioxus::desktop::Config;

        let css = include_str!("../assets/main.css");
        let head = format!(r#"<style>{css}</style>"#);

        dioxus::LaunchBuilder::desktop()
            .with_cfg(Config::new().with_custom_head(head))
            .launch(App);
    }

    // Web
    #[cfg(target_arch = "wasm32")]
    {
        dioxus::launch(App);
    }

    // Android (mobile)
    #[cfg(not(any(feature = "desktop", target_arch = "wasm32")))]
    {
        dioxus::launch(App);
    }
}
