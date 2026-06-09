#!/bin/bash
cd "$(dirname "$0")/.."   # go to project root
set -e
set -o pipefail

echo "========================================="
echo "  Yarik Weather – macOS Build"
echo "========================================="

# ---- Frontend Build ----
cd frontend
echo "Building Next.js frontend for macOS..."
bun run build

# Copy built files to dist-desktop
mkdir -p dist-desktop/_next
cp -r .next/static dist-desktop/_next/
rsync -av --exclude='downloads' public/ dist-desktop/
cp out/index.html dist-desktop/ 2>/dev/null || cp .next/server/app/index.html dist-desktop/index.html

echo "  Web assets prepared in dist-desktop/"

# ---- Launcher icon ----
echo "Generating macOS icon..."
mkdir -p ../src-tauri/icons

# Convert SVG to PNG using qlmanage (macOS built-in)
qlmanage -t -s 1024 -o /tmp public/favicon.svg 2>/dev/null
mv /tmp/favicon.svg.png /tmp/icon.png 2>/dev/null

# Resize and create various icon sizes
sips -z 32 32 /tmp/icon.png --out ../src-tauri/icons/32x32.png
sips -z 128 128 /tmp/icon.png --out ../src-tauri/icons/128x128.png
sips -z 256 256 /tmp/icon.png --out ../src-tauri/icons/128x128@2x.png
sips -z 256 256 /tmp/icon.png --out ../src-tauri/icons/icon.icns
sips -z 256 256 /tmp/icon.png --out ../src-tauri/icons/icon.ico
sips -z 512 512 /tmp/icon.png --out ../src-tauri/icons/512x512.png

cd ..

# ---- Update tauri config for desktop ----
echo "Configuring Tauri for macOS desktop..."
sed -i '' 's|"frontendDist": "../frontend/dist-android"|"frontendDist": "../frontend/dist-desktop"|' src-tauri/tauri.conf.json

# ---- Build macOS app ----
echo "Building macOS app..."
cargo tauri build --target aarch64-apple-darwin 2>&1 | tee /tmp/macos-build.log

# ---- Restore tauri config ----
sed -i '' 's|"frontendDist": "../frontend/dist-desktop"|"frontendDist": "../frontend/dist-android"|' src-tauri/tauri.conf.json

# ---- Copy to downloads ----
echo "Copying macOS builds to downloads..."
mkdir -p frontend/public/downloads

# Find and copy the DMG
DMG_PATH=$(find src-tauri/target -name "*.dmg" -type f | head -1)
if [ -n "$DMG_PATH" ]; then
    cp "$DMG_PATH" frontend/public/downloads/YarikWeather-MacOS.dmg
    echo "  macOS DMG: frontend/public/downloads/YarikWeather-MacOS.dmg"
else
    echo "  Warning: No DMG found, copying .app bundle instead..."
    APP_PATH=$(find src-tauri/target -name "*.app" -type d | head -1)
    if [ -n "$APP_PATH" ]; then
        tar -czf frontend/public/downloads/YarikWeather-MacOS.app.tar.gz -C "$(dirname "$APP_PATH")" "$(basename "$APP_PATH")"
        echo "  macOS App (tar.gz): frontend/public/downloads/YarikWeather-MacOS.app.tar.gz"
    fi
fi

# ---- Clean up dist-desktop ----
rm -rf frontend/dist-desktop

echo ""
echo "========================================="
echo "  ✅ macOS build ready!"
echo "========================================="