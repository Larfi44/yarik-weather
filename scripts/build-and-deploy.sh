#!/bin/bash
cd "$(dirname "$0")"
set -e
set -o pipefail

echo "========================================="
echo "  Yarik Weather - Build & Deploy"
echo "========================================="
echo ""

# ---- Backend (legacy, opt-in) ----
# The website reads api-ninjas directly from the browser now, and the old
# Yandex Cloud containers are gone, so this step is skipped by default.
# Run ./build-and-deploy-backend.sh by hand (after updating the registry
# details) if you are deploying a self-hosted backend again.
echo ">>> Backends: skipped (legacy — the site calls api-ninjas in the browser)"
echo ""

# ---- Android Mobile ----
echo ">>> Building Android..."
./build-android.sh
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