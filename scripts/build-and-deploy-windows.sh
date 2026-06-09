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

# Convert SVG to PNG using qlmanage (macOS built-in)
qlmanage -t -s 1024 -o /tmp public/favicon.svg 2>/dev/null
mv /tmp/favicon.svg.png /tmp/icon.png 2>/dev/null

# Resize and create various icon sizes
sips -z 32 32 /tmp/icon.png --out ../src-tauri/icons/32x32.png
sips -z 128 128 /tmp/icon.png --out ../src-tauri/icons/128x128.png
sips -z 256 256 /tmp/icon.png --out ../src-tauri/icons/128x128@2x.png
sips -z 256 256 /tmp/icon.png --out ../src-tauri/icons/icon.icns
# Use ImageMagick for ICO — sips generates PNG-with-.ico which breaks llvm-rc
magick convert /tmp/icon.png -define icon:auto-resize=256,128,64,48,32,16 ../src-tauri/icons/icon.ico
sips -z 512 512 /tmp/icon.png --out ../src-tauri/icons/512x512.png

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