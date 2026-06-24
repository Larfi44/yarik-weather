#!/bin/bash
cd "$(dirname "$0")/.."   # go to project root
set -e
set -o pipefail

echo "========================================="
echo "  Yarik Weather – Windows Build"
echo "========================================="

# ---- Frontend Build ----
cd frontend
echo "Building Next.js frontend for Windows..."
bun run build

# Copy built files to dist-desktop
mkdir -p dist-desktop/_next
cp -r .next/static dist-desktop/_next/
rsync -av --exclude='downloads' public/ dist-desktop/
cp out/index.html dist-desktop/ 2>/dev/null || cp .next/server/app/index.html dist-desktop/index.html

echo "  Web assets prepared in dist-desktop/"

# ---- Launcher icon ----
echo "Generating Windows icon..."
mkdir -p ../src-tauri/icons

# Use ImageMagick for all icon generation (most reliable SVG→PNG conversion)
if ! command -v magick &> /dev/null; then
    echo "ImageMagick not found. Installing via Homebrew..."
    brew install imagemagick
fi

# Convert SVG to a high-res PNG master (1024x1024) with transparency
magick convert -background none -density 300 ../frontend/public/favicon.svg -resize 1024x1024 /tmp/icon-master.png

# Generate PNG icons at all required sizes
magick convert /tmp/icon-master.png -resize 32x32   ../src-tauri/icons/32x32.png
magick convert /tmp/icon-master.png -resize 128x128 ../src-tauri/icons/128x128.png
magick convert /tmp/icon-master.png -resize 256x256 ../src-tauri/icons/128x128@2x.png
magick convert /tmp/icon-master.png -resize 512x512 ../src-tauri/icons/512x512.png
magick convert /tmp/icon-master.png -resize 512x512 ../src-tauri/icons/icon.png

# Generate proper .icns using iconutil (macOS native, correct format)
mkdir -p /tmp/icon.iconset
magick convert /tmp/icon-master.png -resize 16x16     /tmp/icon.iconset/icon_16x16.png
magick convert /tmp/icon-master.png -resize 32x32     /tmp/icon.iconset/icon_32x32.png
magick convert /tmp/icon-master.png -resize 64x64     /tmp/icon.iconset/icon_64x64.png
magick convert /tmp/icon-master.png -resize 128x128   /tmp/icon.iconset/icon_128x128.png
magick convert /tmp/icon-master.png -resize 256x256   /tmp/icon.iconset/icon_256x256.png
magick convert /tmp/icon-master.png -resize 512x512   /tmp/icon.iconset/icon_512x512.png
cp /tmp/icon.iconset/icon_32x32.png  /tmp/icon.iconset/icon_16x16@2x.png
cp /tmp/icon.iconset/icon_64x64.png  /tmp/icon.iconset/icon_32x32@2x.png
cp /tmp/icon.iconset/icon_256x256.png /tmp/icon.iconset/icon_128x128@2x.png
iconutil -c icns /tmp/icon.iconset -o ../src-tauri/icons/icon.icns
rm -rf /tmp/icon.iconset

# Generate proper .ico for Windows
magick convert /tmp/icon-master.png -define icon:auto-resize=256,128,64,48,32,16 ../src-tauri/icons/icon.ico

rm -f /tmp/icon-master.png

cd ..

# ---- Update tauri config for desktop ----
echo "Configuring Tauri for Windows desktop..."
sed -i '' 's|"frontendDist": "../frontend/dist-android"|"frontendDist": "../frontend/dist-desktop"|' src-tauri/tauri.conf.json

# ---- Build Windows app ----
echo "Building Windows app (cross-compile via lld-link)..."
export PATH="/opt/homebrew/opt/llvm/bin:$PATH"

# Use LLVM's lld-link as the MSVC linker for cross-compilation
export CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER="lld-link"
export CC_x86_64_pc_windows_msvc="clang-cl"
export CXX_x86_64_pc_windows_msvc="clang-cl"

cargo tauri build --target x86_64-pc-windows-msvc 2>&1 | tee /tmp/windows-build.log

# ---- Restore tauri config ----
sed -i '' 's|"frontendDist": "../frontend/dist-desktop"|"frontendDist": "../frontend/dist-android"|' src-tauri/tauri.conf.json

# ---- Copy to downloads ----
echo "Copying Windows builds to downloads..."
mkdir -p frontend/public/downloads

# Find and copy the MSI/EXE
MSI_PATH=$(find src-tauri/target -name "*.msi" -type f | head -1)
EXE_PATH=$(find src-tauri/target -name "*.exe" -type f -not -name "*setup*" | head -1)

if [ -n "$MSI_PATH" ]; then
    cp "$MSI_PATH" frontend/public/downloads/YarikWeather-Windows.msi
    echo "  Windows MSI: frontend/public/downloads/YarikWeather-Windows.msi"
fi

if [ -n "$EXE_PATH" ]; then
    cp "$EXE_PATH" frontend/public/downloads/YarikWeather-Windows.exe
    echo "  Windows EXE: frontend/public/downloads/YarikWeather-Windows.exe"
fi

# ---- Clean up dist-desktop ----
rm -rf frontend/dist-desktop

echo ""
echo "========================================="
echo "  ✅ Windows build ready!"
echo "========================================="