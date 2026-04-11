use axum::{routing::{get}, Router};
use axum::extract::Path;
use axum::Json;
use reqwest;
use axum::response::IntoResponse;

const PORT: u16 = 3000;

#[derive(serde::Deserialize, Debug)]
struct WeatherResponse {
   current: CurrentWeather, 
}

#[derive(serde::Deserialize, Debug)]
struct CurrentWeather {
    temperature_2m: f64,
    wind_speed_10m: f64,
    relative_humidity_2m: f64,
}

async fn get_coordinates(city: &str) -> (f64, f64) {
    let url = format!(
        "https://geocoding-api.open-meteo.com/v1/search?name={}&count=1&language=en&format=json",
        city
    );

    let response: serde_json::Value = reqwest::get(&url)
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    
    let lat = response["results"][0]["latitude"].as_f64().unwrap();
    let lon = response["results"][0]["longitude"].as_f64().unwrap();

    (lat, lon)

}

async fn get_weather(Path(city): Path<String>) -> impl IntoResponse {
    let (lat, lon) = get_coordinates(&city).await;

    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={}&longitude={}&current=temperature_2m,wind_speed_10m,relative_humidity_2m",
        lat, lon
    );
    
    let weather: WeatherResponse = reqwest::get(&url).await.unwrap().json().await.unwrap();

   Json(weather.current);
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/get_weather/{city}", get(get_weather));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.expect("Failed to bind port {PORT}");
    println!("Server starting in port {PORT}");
    axum::serve(listener, app).await.expect("Server failed");
}

