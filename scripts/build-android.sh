#!/bin/bash
cd "$(dirname "$0")/.."   # go to project root
set -e
set -o pipefail

echo "========================================="
echo "  Yarik Weather – Android Build"
echo "========================================="

# ---- Frontend Build ----
cd frontend
echo "Installing dependencies..."
bun install
echo "Building Next.js frontend for Android..."
bun run build

# Clean and prepare dist-android (remove old builds)
rm -rf dist-android
mkdir -p dist-android/_next
cp -r .next/static dist-android/_next/
rsync -av --exclude='downloads' public/ dist-android/
cp out/index.html dist-android/ 2>/dev/null || cp .next/server/app/index.html dist-android/index.html

echo "  Web assets prepared in dist-android/"

# Remove node_modules to prevent it from being bundled into APK (saves ~500MB+)
echo "Removing node_modules to reduce APK size..."
rm -rf node_modules

# ---- Launcher icon ----
echo "Generating icons..."
cd ..
python3 scripts/generate-icons.py
echo "  Icons generated with cargo tauri icon"

# ---- Update tauri config for Android ----
echo "Configuring Tauri for Android..."
sed -i '' 's|"frontendDist": "../frontend/dist-desktop"|"frontendDist": "../frontend/dist-android"|' src-tauri/tauri.conf.json

# ---- Generate Android project with icons ----
export TAURI_ANDROID_AGP_VERSION=8.2.0
export TAURI_ANDROID_TARGETS="aarch64"
echo "Initializing Android project..."
rm -rf src-tauri/gen/android
cargo tauri android init

# ---- Build APK ----
echo "Building APK (aarch64)..."
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

# ---- Clean up the root copy ----
rm -f YarikWeather-Android.apk

echo ""
echo "========================================="
echo "  ✅ Android .apk ready!"
echo "  frontend/public/downloads/YarikWeather-Android.apk"
echo "========================================="