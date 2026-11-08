use tauri::plugin::{Builder as PluginBuilder, TauriPlugin};
use tauri::{Manager, Runtime, Url};
use tauri_plugin_opener::OpenerExt;

/// Hosts the bundled frontend is served from: `tauri.localhost` on Android /
/// Windows, `localhost` / `127.0.0.1` while dev-serving, `ipc.localhost` for
/// the IPC bridge.
const APP_HOSTS: [&str; 5] = [
  "localhost",
  "tauri.localhost",
  "ipc.localhost",
  "127.0.0.1",
  "[::1]",
];

/// True when the URL points at the app's own assets, i.e. it may load in the
/// webview. Everything else is an external site and belongs in the browser.
fn is_app_url(url: &Url) -> bool {
  match url.scheme() {
    // Bundled frontend and IPC / asset protocols (tauri://localhost on macOS
    // and Linux, asset:// and ipc:// on Windows and mobile).
    "tauri" | "asset" | "ipc" => true,
    "http" | "https" => url
      .host_str()
      .map(|host| APP_HOSTS.contains(&host))
      .unwrap_or(false),
    // Inline / generated content that must not trigger the browser.
    "data" | "blob" | "about" => true,
    _ => false,
  }
}

/// Cancels navigations the frontend did not catch (a plain `<a>` without a
/// click handler, `location.href = ...`, a `target="_blank"` window request)
/// and opens the URL with the OS default browser instead.
///
/// Without this guard the Android WebView happily loads a tapped link in place,
/// replacing the app UI with a web page.
fn external_links_guard<R: Runtime>() -> TauriPlugin<R> {
  PluginBuilder::new("external-links")
    .on_navigation(|webview, url| {
      if is_app_url(url) {
        return true;
      }
      // Never open the URL inline here: on Android `on_navigation` is called
      // straight from `RustWebViewClient.shouldOverrideUrlLoading`, i.e. on the
      // UI thread, while the opener is a blocking mobile-plugin call
      // (`run_mobile_plugin` waits on a channel that same UI thread has to
      // drain). Doing it inline deadlocks the main thread, and the app gets an
      // ANR half a minute later. Cancel the navigation now and hand the URL to
      // the OS from a worker thread instead.
      let target = url.to_string();
      let app = webview.app_handle().clone();
      std::thread::spawn(move || {
        log::info!("opening {target} in the system browser");
        if let Err(err) = app.opener().open_url(target.clone(), None::<&str>) {
          log::warn!("could not open {target} in the system browser: {err}");
        }
      });
      false
    })
    .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(external_links_guard())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
