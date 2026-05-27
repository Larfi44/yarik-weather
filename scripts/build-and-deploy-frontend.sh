#!/bin/bash
cd "$(dirname "$0")"
set -e
set -o pipefail

echo "========================================="
echo "  Yarik Weather - Build & Deploy"
echo "========================================="

cd ..

# ---- MacOS ----
cd frontend
mkdir -p assets/downloads

echo "Building MacOS..."
cargo build --release --features desktop -j 4 2>&1 | tail -60

echo "Packaging MacOS..."
rm -rf YarikWeather.app YarikWeather-MacOS.dmg
mkdir -p YarikWeather.app/Contents/MacOS YarikWeather.app/Contents/Resources
cp target/release/yarik-weather YarikWeather.app/Contents/MacOS/YarikWeather
chmod +x YarikWeather.app/Contents/MacOS/YarikWeather
cp assets/favicon.svg YarikWeather.app/Contents/MacOS/
cp assets/icon.icns YarikWeather.app/Contents/Resources/

cat > YarikWeather.app/Contents/Info.plist << 'ENDPLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key><string>YarikWeather</string>
    <key>CFBundleIdentifier</key><string>com.yarikstudio.yarikweather</string>
    <key>CFBundleName</key><string>Yarik Weather</string>
    <key>CFBundleVersion</key><string>1.0</string>
    <key>CFBundleShortVersionString</key><string>1.0</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleIconFile</key><string>icon</string>
</dict>
</plist>
ENDPLIST

xattr -cr YarikWeather.app 2>/dev/null || true
hdiutil create -volname "YarikWeather" -srcfolder YarikWeather.app -ov -format UDZO YarikWeather-MacOS.dmg
cp YarikWeather-MacOS.dmg assets/downloads/
echo "MacOS .dmg done"

# ---- Windows ----
echo "Building Windows..."
export PATH="/opt/homebrew/opt/llvm/bin:$PATH"
cargo xwin build --release --target x86_64-pc-windows-msvc --features desktop 2>&1 | tail -1

echo "Packaging Windows..."
cp target/x86_64-pc-windows-msvc/release/yarik-weather.exe YarikWeather-Windows.exe
cp YarikWeather-Windows.exe assets/downloads/
echo "Windows .exe done"
cd ..

# ---- Prepare downloads folder ----
mkdir -p frontend/assets/downloads

# ---- Android ----
echo "Building Android..."
cd frontend

echo "  Building WASM for Android..."
cargo build --release --target wasm32-unknown-unknown --features mobile 2>&1 | tail -1

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

echo "  Android web assets prepared in dist-android/"

echo "  Generating Android icon..."
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
export TAURI_ANDROID_AGP_VERSION=8.2.0
export TAURI_ANDROID_TARGETS="aarch64"
echo "  Building APK..."
rm -rf src-tauri/gen/android
cargo tauri android init
cargo tauri android build --target aarch64 2>&1 | tee /tmp/android-build.log

APK_PATH=$(find src-tauri/gen/android -name "*.apk" -type f | head -1)
if [ -z "$APK_PATH" ]; then
    echo "Error: No APK found after build"
    exit 1
fi
echo "  Signing APK: $APK_PATH"

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

cp YarikWeather-Android.apk frontend/assets/downloads/

echo "Android .apk done"

# ---- Web (rebuild without tauri feature) ----
echo "Building web assets..."
cd frontend
cargo build --release --target wasm32-unknown-unknown
mkdir -p dist-web/wasm dist-web/assets
wasm-bindgen --out-dir dist-web/wasm --target web target/wasm32-unknown-unknown/release/yarik-weather.wasm
cp -r assets/* dist-web/assets/
cat > dist-web/index.html << 'EOF'
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

echo "Preparing web upload..."
mkdir -p web-upload
cp -r dist-web/* web-upload/
mkdir -p web-upload/downloads
cp assets/downloads/* web-upload/downloads/

echo "Uploading to Yandex..."
cd web-upload
aws s3 sync . s3://yarik-weather-app/ --endpoint-url=https://storage.yandexcloud.net --no-progress
cd ..
rm -rf web-upload dist-web
cd ..

# ---- Clean up temporary files ----
rm -rf frontend/YarikWeather.app
rm -f  frontend/YarikWeather-MacOS.dmg
rm -f  frontend/YarikWeather-Windows.exe
rm -f  YarikWeather-Android.apk YarikWeather-Android.apk.idsig

echo ""
echo "========================================="
echo "  ✅ Frontend done!"
echo "  https://yarik-weather-app.website.yandexcloud.net"
echo "========================================="