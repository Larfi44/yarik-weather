#!/bin/bash
cd "$(dirname "$0")/.."   # go to project root
set -e
set -o pipefail

echo "========================================="
echo "  Yarik Weather – MacOS Build"
echo "========================================="

# ---- Frontend Build ----
cd frontend
echo "Installing dependencies..."
bun install
echo "Building Next.js frontend for MacOS..."
bun run build

# Copy built files to dist-desktop
mkdir -p dist-desktop/_next
cp -r .next/static dist-desktop/_next/
rsync -av --exclude='downloads' public/ dist-desktop/
cp out/index.html dist-desktop/ 2>/dev/null || cp .next/server/app/index.html dist-desktop/index.html

echo "  Web assets prepared in dist-desktop (paths unmodified)"

# ---- Launcher icon ----
echo "Generating MacOS icon..."
mkdir -p ../src-tauri/icons

# Render SVG to PNG master, then use Pillow for proper RGBA output
pip3 install Pillow -q 2>/dev/null
magick convert -background none -density 300 ../frontend/public/favicon.svg -resize 1024x1024 -alpha on /tmp/icon-master.png

python3 << 'PYEOF'
from PIL import Image
img = Image.open('/tmp/icon-master.png').convert('RGBA')
sizes = {'32x32.png':32,'128x128.png':128,'128x128@2x.png':256,'512x512.png':512,'icon.png':512}
for f,s in sizes.items():
    r = img.resize((s,s), Image.LANCZOS)
    r.save('../src-tauri/icons/'+f,'PNG')
    print(f'{f}: RGBA {s}x{s}')

# Generate icns via iconset
import os, subprocess, shutil
os.makedirs('/tmp/icon.iconset', exist_ok=True)
for s in [16,32,64,128,256,512]:
    r = img.resize((s,s), Image.LANCZOS)
    r.save(f'/tmp/icon.iconset/icon_{s}x{s}.png','PNG')
shutil.copy('/tmp/icon.iconset/icon_32x32.png','/tmp/icon.iconset/icon_16x16@2x.png')
shutil.copy('/tmp/icon.iconset/icon_64x64.png','/tmp/icon.iconset/icon_32x32@2x.png')
shutil.copy('/tmp/icon.iconset/icon_256x256.png','/tmp/icon.iconset/icon_128x128@2x.png')
subprocess.run(['iconutil','-c','icns','/tmp/icon.iconset','-o','../src-tauri/icons/icon.icns'])
shutil.rmtree('/tmp/icon.iconset')

# ICO
r = img.resize((256,256), Image.LANCZOS)
r.save('../src-tauri/icons/icon.ico', 'ICO', sizes=[(256,256),(128,128),(64,64),(32,32),(16,16)])
print('icon.ico generated')
PYEOF

echo "  Icons generated (all RGBA)"

cd ..

# ---- Update tauri config for desktop ----
echo "Configuring Tauri for MacOS desktop..."
sed -i '' 's|"frontendDist": "../frontend/dist-[^"]*"|"frontendDist": "../frontend/dist-desktop"|' src-tauri/tauri.conf.json
grep frontendDist src-tauri/tauri.conf.json

# ---- Build MacOS app ----
echo "Building MacOS app..."
cargo tauri build --target aarch64-apple-darwin 2>&1 | tee /tmp/macos-build.log

# ---- Restore tauri config ----
sed -i '' 's|"frontendDist": "../frontend/dist-desktop"|"frontendDist": "../frontend/dist-android"|' src-tauri/tauri.conf.json

# ---- Copy to downloads ----
echo "Copying MacOS builds to downloads..."
mkdir -p frontend/public/downloads

# Find and copy the DMG (may fail if bundle_dmg.sh has issues)
DMG_PATH=$(find src-tauri/target -name "*.dmg" -type f | head -1)
if [ -n "$DMG_PATH" ]; then
    cp "$DMG_PATH" frontend/public/downloads/YarikWeather-MacOS.dmg
    echo "  MacOS DMG: frontend/public/downloads/YarikWeather-MacOS.dmg"
fi

# Also copy/pack the .app bundle as backup
APP_PATH=$(find src-tauri/target -name "Yarik Weather.app" -type d | head -1)
if [ -n "$APP_PATH" ]; then
    echo "  Packaging .app bundle..."
    # Copy .app as a zip (more macOS friendly than tar.gz)
    cd "$(dirname "$APP_PATH")"
    zip -r /tmp/YarikWeather-MacOS.app.zip "$(basename "$APP_PATH")" 2>/dev/null
    cd "$OLDPWD"
    cp /tmp/YarikWeather-MacOS.app.zip frontend/public/downloads/YarikWeather-MacOS.app.zip 2>/dev/null
    echo "  MacOS App (.zip): frontend/public/downloads/YarikWeather-MacOS.app.zip"
fi

# ---- Clean up dist-desktop ----
rm -rf frontend/dist-desktop

echo ""
echo "========================================="
echo "  ✅ MacOS build ready!"
echo "========================================="