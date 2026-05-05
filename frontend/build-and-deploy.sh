#!/bin/bash
cd "$(dirname "$0")"
set -e

echo "========================================="
echo "  Yarik Weather - Build & Deploy"
echo "========================================="

# ========== macOS ==========
echo "Building macOS..."
cargo build --release --features desktop 2>&1 | tail -1

echo "Packaging macOS..."
rm -rf YarikWeather.app YarikWeather-MacOS.dmg
mkdir -p YarikWeather.app/Contents/MacOS
mkdir -p YarikWeather.app/Contents/Resources
cp target/release/frontend YarikWeather.app/Contents/MacOS/YarikWeather
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
create-dmg \
  --volname "YarikWeather" \
  --window-pos 200 120 \
  --window-size 800 400 \
  --icon-size 100 \
  --icon "YarikWeather.app" 200 190 \
  --hide-extension "YarikWeather.app" \
  --app-drop-link 600 185 \
  "YarikWeather-MacOS.dmg" \
  YarikWeather.app
echo "macOS DMG done"

# ========== Windows ==========
echo "Building Windows..."
export PATH="/opt/homebrew/opt/llvm/bin:$PATH"
cargo xwin build --release --target x86_64-pc-windows-msvc --features desktop 2>&1 | tail -1

echo "Packaging Windows..."
cp target/x86_64-pc-windows-msvc/release/frontend.exe YarikWeather-Windows.exe
echo "Windows EXE done"

# ========== Copy to downloads ==========
mkdir -p assets/downloads
cp YarikWeather-MacOS.dmg assets/downloads/
cp YarikWeather-Windows.exe assets/downloads/

# ========== Web ==========
echo "Building web..."
dx build --release --platform web 2>&1 | tail -1

echo "Preparing upload..."
mkdir -p target/dx/frontend/release/web/public/downloads
cp assets/downloads/YarikWeather-MacOS.dmg target/dx/frontend/release/web/public/downloads/
cp assets/downloads/YarikWeather-Windows.exe target/dx/frontend/release/web/public/downloads/

# ========== Upload ==========
echo "Uploading to Yandex..."
cd target/dx/frontend/release/web/public
aws s3 sync . s3://yarik-weather-app/ --endpoint-url=https://storage.yandexcloud.net --no-progress
cd "$OLDPWD"

# ========== Clean up ==========
rm -rf YarikWeather.app YarikWeather-MacOS.dmg YarikWeather-Windows.exe

echo ""
echo "========================================="
echo "  ✅ Done!"
echo "  https://yarik-weather-app.website.yandexcloud.net"
echo "========================================="
