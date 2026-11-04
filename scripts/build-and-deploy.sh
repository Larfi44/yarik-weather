#!/bin/bash
cd "$(dirname "$0")"
set -e
set -o pipefail

echo "========================================="
echo "  Yarik Weather - Build & Deploy"
echo "========================================="
echo ""

# ---- Backend (legacy, opt-in) ----
# The website reads Open-Meteo directly from the browser now, and the old
# Yandex Cloud containers are gone, so this step is skipped by default.
# Run ./build-and-deploy-backend.sh by hand (after updating the registry
# details) if you are deploying a self-hosted backend again.
echo ">>> Backends: skipped (legacy — the site calls Open-Meteo in the browser)"
echo ""

# ---- Android Mobile ----
echo ">>> Building Android..."
./build-android.sh
echo ""

# ---- Final Cleanup ----
cd ..
echo "Cleaning up temporary files..."

# Intermediate build output only — the APK the user downloads stays in
# src/assets/downloads/ and the site itself is served from src/out/.
rm -rf src-tauri/gen/android/app/build
rm -rf src-tauri/target/release/bundle

echo ""

echo "========================================="
echo "  ✅ All platforms built & deployed!"
echo "  https://yarik-weather-app.website.yandexcloud.net"
echo "========================================="