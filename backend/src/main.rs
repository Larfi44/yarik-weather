mod forecast;
mod geocoding;
mod main_handler;
mod open_meteo_forecast_structs;
mod unified_response_structs;
mod utils;
mod yesterday;

use crate::main_handler::get_weather;
use crate::utils::weather_description;

use axum::{Router, routing::get};
use tower_http::cors::{Any, CorsLayer};

const PORT: u16 = 8080;

#[tokio::main]
async fn main() {
    let cors: CorsLayer = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app: Router = Router::new()
        .route("/get_weather/{city}", get(get_weather))
        .layer(cors);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{PORT}"))
        .await
        .expect(&format!("Failed to bind port {}", PORT));

    println!("Server starting on port {}", PORT);
    axum::serve(listener, app).await.expect("Server failed");
}
