mod api;
mod app;
mod assets;
mod components;
mod helpers;
mod settings;
mod types;

use crate::app::App;

fn main() {
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
