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

echo "  Web assets copied (paths unmodified — Tauri handles serving natively)"

echo "  Web assets prepared in dist-android/"

# Remove node_modules to prevent it from being bundled into APK (saves ~500MB+)
echo "Removing node_modules to reduce APK size..."
rm -rf node_modules

# ---- Launcher icon ----
echo "Generating Android icon..."
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

# Also generate for icns iconset
import os, subprocess
os.makedirs('/tmp/icon.iconset', exist_ok=True)
for s in [16,32,64,128,256,512]:
    r = img.resize((s,s), Image.LANCZOS)
    r.save(f'/tmp/icon.iconset/icon_{s}x{s}.png','PNG')
# retina copies
import shutil
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