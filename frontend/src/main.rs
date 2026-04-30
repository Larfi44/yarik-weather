mod api;
mod app;
mod assets;
mod components;
mod helpers;
mod settings;
mod types;

use crate::app::App;

fn main() {
    dioxus::launch(App);
}
