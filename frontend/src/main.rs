mod api;
mod app;
mod download_modal;
mod helpers;
mod search_bar;
mod settings;
mod settings_modal;
mod types;
mod weather_display;
mod welcome_modal;

use crate::app::App;

use dioxus::prelude::*;

const ANDROID_ICON: Asset = asset!("/assets/android.png");
const APPLE_LIGHT: Asset = asset!("/assets/apple-light.svg");
const APPLE_DARK: Asset = asset!("/assets/apple-dark.svg");
const LINUX_ICON: Asset = asset!("/assets/linux.png");
const WINDOWS_ICON: Asset = asset!("/assets/windows.svg");

fn main() {
    dioxus::launch(App);
}
