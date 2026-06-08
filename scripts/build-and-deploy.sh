#!/bin/bash
cd "$(dirname "$0")"
set -e
set -o pipefail

echo "========================================="
echo "  Yarik Weather - Build & Deploy"
echo "========================================="
echo ""

# ---- Backend ----
echo ">>> Deploying backends..."
./build-and-deploy-backend.sh
echo ""

# ---- macOS Desktop ----
echo ">>> Building macOS..."
./build-and-deploy-macos.sh
echo ""

# ---- Windows Desktop ----
echo ">>> Building Windows..."
./build-and-deploy-windows.sh
echo ""

# ---- Android Mobile ----
echo ">>> Building Android..."
./build-and-deploy-android.sh
echo ""

# ---- Web Frontend ----
echo ">>> Building & deploying web frontend..."
./build-and-deploy-frontend.sh
echo ""

# ---- Final Cleanup ----
cd ..
echo "Cleaning up temporary files..."

rm -rf frontend/dist-desktop frontend/dist-android frontend/dist-web frontend/web-upload
rm -rf frontend/YarikWeather.app
rm -f  frontend/YarikWeather-MacOS.dmg
rm -f  frontend/YarikWeather-Windows.exe frontend/YarikWeather-Windows.msi
rm -f  YarikWeather-Android.apk YarikWeather-Android.apk.idsig

echo ""

echo "========================================="
echo "  ✅ All platforms built & deployed!"
echo "  https://yarik-weather-app.website.yandexcloud.net"
echo "========================================="