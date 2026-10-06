#!/bin/bash
cd "$(dirname "$0")/.."   # go to project root
set -e
set -o pipefail

echo "========================================="
echo "  Yarik Weather – Android Build"
echo "========================================="

# ---- Frontend Build ----
echo "Building static frontend (frontend/public -> frontend/out)..."
bash frontend/scripts/build.sh

# No bundler involved: out/ is exactly what Tauri bundles (frontendDist).
echo "  Web assets prepared in frontend/out/"

# ---- Launcher icon ----
echo "Generating icons..."
python3 scripts/generate-icons.py
echo "  Icons generated with cargo tauri icon"

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
  --out yarik-weather.apk \
  "$APK_PATH"

# ---- Copy to downloads ----
mkdir -p frontend/public/downloads
cp yarik-weather.apk frontend/public/downloads/

# ---- Clean up the root copy ----
rm -f yarik-weather.apk

echo ""
echo "========================================="
echo "  ✅ Android .apk ready!"
echo "  frontend/public/downloads/yarik-weather.apk"
echo "========================================="