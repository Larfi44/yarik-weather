#!/bin/bash
cd "$(dirname "$0")"
set -e
set -o pipefail

echo "========================================="
echo "  Yarik Weather - Web Frontend Deploy"
echo "========================================="

cd ..

# ---- Web (WASM build, no tauri feature) ----
cd frontend
echo "Building web assets (WASM)..."
cargo build --release --target wasm32-unknown-unknown

if ! command -v wasm-bindgen &> /dev/null; then
    cargo install wasm-bindgen-cli --version 0.2.120
fi

mkdir -p dist-web/wasm dist-web/assets
wasm-bindgen --out-dir dist-web/wasm --target web target/wasm32-unknown-unknown/release/yarik-weather.wasm
cp -r assets/* dist-web/assets/
cat > dist-web/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Yarik Weather</title>
  <link rel="icon" type="image/svg+xml" href="./assets/favicon.svg" />
  <link rel="stylesheet" href="./assets/main.css" />
</head>
<body>
  <div id="main"></div>
  <script type="module">
    import init from './wasm/yarik-weather.js';
    init('./wasm/yarik-weather_bg.wasm');
  </script>
</body>
</html>
EOF

# ---- Collect downloads from platform builds ----
echo "Collecting platform downloads..."
mkdir -p web-upload
cp -r dist-web/* web-upload/
mkdir -p web-upload/downloads

# Copy downloads placed by individual platform scripts (macOS, Windows, Android)
if [ -d "public/downloads" ]; then
    cp -r public/downloads/* web-upload/downloads/ 2>/dev/null || true
fi

# ---- Upload to Yandex S3 ----
echo "Uploading to Yandex..."
cd web-upload
aws s3 sync . s3://yarik-weather-app/ --endpoint-url=https://storage.yandexcloud.net --no-progress
cd ..

# ---- Clean up ----
rm -rf web-upload dist-web

cd ..
echo ""
echo "========================================="
echo "  ✅ Web frontend deployed!"
echo "  https://yarik-weather-app.website.yandexcloud.net"
echo "========================================="