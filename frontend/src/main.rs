mod api;
mod app;
mod assets;
mod components;
mod helpers;
mod settings;
mod types;

use crate::app::App;

fn main() {
    #[cfg(any(feature = "desktop", not(target_arch = "wasm32")))]
    {
        use dioxus::desktop::Config;

        let css = include_str!("../assets/main.css");
        // Convert favicon to base64
        let favicon_base64 = base64_favicon();
        let head = format!(
            r#"<style>{css}</style><link rel="icon" href="data:image/svg+xml;base64,{favicon_base64}">"#
        );

        dioxus::LaunchBuilder::desktop()
            .with_cfg(Config::new().with_custom_head(head))
            .launch(App);
    }

    #[cfg(target_arch = "wasm32")]
    {
        dioxus::launch(App);
    }
}

fn base64_favicon() -> String {
    use base64::{engine::general_purpose, Engine as _};
    let svg_bytes = include_bytes!("../assets/favicon.svg");
    let svg_str = std::str::from_utf8(svg_bytes).unwrap_or("");
    general_purpose::STANDARD.encode(svg_str)
}
