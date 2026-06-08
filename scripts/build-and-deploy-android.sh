#!/bin/bash
cd "$(dirname "$0")/.."   # go to project root
set -e
set -o pipefail

echo "========================================="
echo "  Yarik Weather – Android Build"
echo "========================================="

# ---- Frontend Build ----
cd frontend
echo "Building Next.js frontend for Android..."
bun run build

# Copy built files to dist-android
mkdir -p dist-android/_next
cp -r .next/static dist-android/_next/
cp -r public/* dist-android/
cp out/index.html dist-android/ 2>/dev/null || cp .next/server/app/index.html dist-android/index.html

echo "  Web assets prepared in dist-android/"

# ---- Launcher icon ----
echo "Generating Android icon..."
mkdir -p ../src-tauri/icons

# Convert SVG to PNG using ImageMagick (more reliable for automation)
if ! command -v magick &> /dev/null; then
    echo "ImageMagick not found. Installing via Homebrew..."
    brew install imagemagick
fi

# Convert SVG to PNG
magick convert ../frontend/public/favicon.svg /tmp/icon.png

# Resize and create various icon sizes using ImageMagick with alpha channel
magick convert /tmp/icon.png -define png:color-type=6 -resize 32x32 ../src-tauri/icons/32x32.png
magick convert /tmp/icon.png -define png:color-type=6 -resize 128x128 ../src-tauri/icons/128x128.png
magick convert /tmp/icon.png -define png:color-type=6 -resize 256x256 ../src-tauri/icons/128x128@2x.png
magick convert /tmp/icon.png -define png:color-type=6 -resize 256x256 ../src-tauri/icons/icon.icns
magick convert /tmp/icon.png -define png:color-type=6 -resize 256x256 ../src-tauri/icons/icon.ico
magick convert /tmp/icon.png -define png:color-type=6 -resize 512x512 ../src-tauri/icons/512x512.png

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
mkdir -p frontend/public/downloads
cp YarikWeather-Android.apk frontend/public/downloads/
rm -f YarikWeather-Android.apk   # clean up the root copy

echo ""
echo "========================================="
echo "  ✅ Android APK ready!"
echo "  frontend/public/downloads/YarikWeather-Android.apk"
echo "========================================="
