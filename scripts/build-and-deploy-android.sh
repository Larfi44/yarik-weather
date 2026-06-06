#!/bin/bash
cd "$(dirname "$0")/.."   # go to project root
set -e
set -o pipefail

echo "========================================="
echo "  Yarik Weather – Android Build"
echo "========================================="

# ---- Frontend WASM ----
cd frontend
echo "Building WASM for Android..."
cargo build --release --target wasm32-unknown-unknown --features mobile 2>&1 | tail -3

if ! command -v wasm-bindgen &> /dev/null; then
    cargo install wasm-bindgen-cli --version 0.2.120
fi

mkdir -p dist-android/wasm dist-android/assets
wasm-bindgen \
    --out-dir dist-android/wasm \
    --target web \
    target/wasm32-unknown-unknown/release/yarik-weather.wasm

cp -r assets/* dist-android/assets/
cat > dist-android/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Yarik Weather</title>
  <link rel="icon" type="image/svg+xml" href="./assets/favicon.svg" />
  <link rel="stylesheet" href="./assets/main.css" />
</head>
<body>
  <div id="main"></div>
  <script type="module">
    import init from './wasm/yarik-weather.js';
    init('./wasm/yarik-weather_bg.wasm');
  </script>
</body>
</html>
EOF

echo "  Web assets prepared in dist-android/"

# ---- Launcher icon ----
echo "Generating Android icon..."
mkdir -p ../src-tauri/icons
qlmanage -t -s 1024 -o /tmp assets/favicon.svg
mv /tmp/favicon.svg.png /tmp/icon.png
sips -z 32 32 /tmp/icon.png --out ../src-tauri/icons/32x32.png
sips -z 128 128 /tmp/icon.png --out ../src-tauri/icons/128x128.png
sips -z 256 256 /tmp/icon.png --out ../src-tauri/icons/128x128@2x.png
sips -z 256 256 /tmp/icon.png --out ../src-tauri/icons/icon.icns
sips -z 256 256 /tmp/icon.png --out ../src-tauri/icons/icon.ico
sips -z 512 512 /tmp/icon.png --out ../src-tauri/icons/512x512.png

cd ..

# ---- Generate Android project with icons ----
export TAURI_ANDROID_AGP_VERSION=8.2.0
export TAURI_ANDROID_TARGETS="aarch64"
echo "Initializing Android project..."
rm -rf src-tauri/gen/android
cargo tauri android init

# ---- Inject widget receiver into the generated AndroidManifest.xml ----
echo "Injecting widget receiver into AndroidManifest.xml..."
sed -i '' '/<\/application>/i \
    <receiver android:name="com.yarikstudio.yarikweather.widget.YarikWeatherWidget" android:exported="true"> \
        <intent-filter> \
            <action android:name="android.appwidget.action.APPWIDGET_UPDATE" /> \
        </intent-filter> \
        <meta-data android:name="android.appwidget.provider" android:resource="@xml/yarik_weather_widget_info" /> \
    </receiver>' src-tauri/gen/android/app/src/main/AndroidManifest.xml

# ---- Create widget info XML ----
echo "Creating widget info XML..."
mkdir -p src-tauri/gen/android/app/src/main/res/xml
cat > src-tauri/gen/android/app/src/main/res/xml/yarik_weather_widget_info.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="40dp"
    android:minHeight="40dp"
    android:updatePeriodMillis="1800000"
    android:previewImage="@mipmap/ic_launcher"
    android:initialLayout="@layout/widget_layout"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen">
</appwidget-provider>
EOF

# ---- Create minimal widget layout XML (required by the widget provider) ----
echo "Creating widget layout XML..."
mkdir -p src-tauri/gen/android/app/src/main/res/layout
cat > src-tauri/gen/android/app/src/main/res/layout/widget_layout.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:gravity="center">
</LinearLayout>
EOF

# ---- Build APK (single build, codegen units limited to reduce memory) ----
echo "Building APK (aarch64 only)..."
CARGO_BUILD_JOBS=2 cargo tauri android build --target aarch64 2>&1 | tee /tmp/android-build.log

# ---- Sign ----
APK_PATH=$(find src-tauri/gen/android -name "*.apk" -type f | head -1)
if [ -z "$APK_PATH" ]; then
    echo "Error: No APK found after build"
    exit 1
fi
echo "Signing APK: $APK_PATH"

if [ ! -f ~/.android/debug.keystore ]; then
    keytool -genkey -v \
      -keystore ~/.android/debug.keystore \
      -storepass android \
      -alias androiddebugkey \
      -keypass android \
      -keyalg RSA -keysize 2048 -validity 10000 \
      -dname "CN=Android Debug,O=Android,C=US"
fi

~/Library/Android/sdk/build-tools/35.0.0/apksigner sign \
  --ks ~/.android/debug.keystore \
  --ks-pass pass:android \
  --ks-key-alias androiddebugkey \
  --key-pass pass:android \
  --out YarikWeather-Android.apk \
  "$APK_PATH"

# ---- Copy to downloads ----
mkdir -p frontend/assets/downloads
cp YarikWeather-Android.apk frontend/assets/downloads/
rm -f YarikWeather-Android.apk   # clean up the root copy

echo ""
echo "========================================="
echo "  ✅ Android APK ready!"
echo "  frontend/assets/downloads/YarikWeather-Android.apk"
echo "========================================="
echo "  Yarik Weather – Android Build"
echo "========================================="

# ---- Frontend WASM ----
cd frontend
echo "Building WASM for Android..."
cargo build --release --target wasm32-unknown-unknown --features mobile 2>&1 | tail -3

if ! command -v wasm-bindgen &> /dev/null; then
    cargo install wasm-bindgen-cli --version 0.2.120
fi

mkdir -p dist-android/wasm dist-android/assets
wasm-bindgen \
    --out-dir dist-android/wasm \
    --target web \
    target/wasm32-unknown-unknown/release/yarik-weather.wasm

cp -r assets/* dist-android/assets/
cat > dist-android/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Yarik Weather</title>
  <link rel="icon" type="image/svg+xml" href="./assets/favicon.svg" />
  <link rel="stylesheet" href="./assets/main.css" />
</head>
<body>
  <div id="main"></div>
  <script type="module">
    import init from './wasm/yarik-weather.js';
    init('./wasm/yarik-weather_bg.wasm');
  </script>
</body>
</html>
EOF

echo "  Web assets prepared in dist-android/"

# ---- Launcher icon ----
echo "Generating Android icon..."
mkdir -p ../src-tauri/icons
qlmanage -t -s 1024 -o /tmp assets/favicon.svg
mv /tmp/favicon.svg.png /tmp/icon.png
sips -z 32 32 /tmp/icon.png --out ../src-tauri/icons/32x32.png
sips -z 128 128 /tmp/icon.png --out ../src-tauri/icons/128x128.png
sips -z 256 256 /tmp/icon.png --out ../src-tauri/icons/128x128@2x.png
sips -z 256 256 /tmp/icon.png --out ../src-tauri/icons/icon.icns
sips -z 256 256 /tmp/icon.png --out ../src-tauri/icons/icon.ico
sips -z 512 512 /tmp/icon.png --out ../src-tauri/icons/512x512.png

cd ..

# ---- Build APK ----
export TAURI_ANDROID_AGP_VERSION=8.2.0
export TAURI_ANDROID_TARGETS="aarch64"
echo "Building APK (aarch64 only)..."
rm -rf src-tauri/gen/android
cargo tauri android init
cargo tauri android build --target aarch64 2>&1 | tee /tmp/android-build.log

# ---- Inject widget receiver into the generated AndroidManifest.xml ----
echo "Injecting widget receiver into AndroidManifest.xml..."
sed -i '' '/<\/application>/i \
    <receiver android:name="com.yarikstudio.yarikweather.widget.YarikWeatherWidget" android:exported="true"> \
        <intent-filter> \
            <action android:name="android.appwidget.action.APPWIDGET_UPDATE" /> \
        </intent-filter> \
        <meta-data android:name="android.appwidget.provider" android:resource="@xml/yarik_weather_widget_info" /> \
    </receiver>' src-tauri/gen/android/app/src/main/AndroidManifest.xml

# ---- Create widget info XML ----
echo "Creating widget info XML..."
mkdir -p src-tauri/gen/android/app/src/main/res/xml
cat > src-tauri/gen/android/app/src/main/res/xml/yarik_weather_widget_info.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="40dp"
    android:minHeight="40dp"
    android:updatePeriodMillis="1800000"
    android:previewImage="@mipmap/ic_launcher"
    android:initialLayout="@layout/widget_layout"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen">
</appwidget-provider>
EOF

# ---- Create minimal widget layout XML (required by the widget provider) ----
echo "Creating widget layout XML..."
mkdir -p src-tauri/gen/android/app/src/main/res/layout
cat > src-tauri/gen/android/app/src/main/res/layout/widget_layout.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:gravity="center">
</LinearLayout>
EOF

# ---- Build ----
cargo tauri android build --target aarch64 2>&1 | tee /tmp/android-build.log

# ---- Sign ----
APK_PATH=$(find src-tauri/gen/android -name "*.apk" -type f | head -1)
if [ -z "$APK_PATH" ]; then
    echo "Error: No APK found after build"
    exit 1
fi
echo "Signing APK: $APK_PATH"

if [ ! -f ~/.android/debug.keystore ]; then
    keytool -genkey -v \
      -keystore ~/.android/debug.keystore \
      -storepass android \
      -alias androiddebugkey \
      -keypass android \
      -keyalg RSA -keysize 2048 -validity 10000 \
      -dname "CN=Android Debug,O=Android,C=US"
fi

~/Library/Android/sdk/build-tools/35.0.0/apksigner sign \
  --ks ~/.android/debug.keystore \
  --ks-pass pass:android \
  --ks-key-alias androiddebugkey \
  --key-pass pass:android \
  --out YarikWeather-Android.apk \
  "$APK_PATH"

# ---- Copy to downloads ----
mkdir -p frontend/assets/downloads
cp YarikWeather-Android.apk frontend/assets/downloads/
rm -f YarikWeather-Android.apk   # clean up the root copy

echo ""
echo "========================================="
echo "  ✅ Android APK ready!"
echo "  frontend/assets/downloads/YarikWeather-Android.apk"
echo "========================================="