#!/bin/bash
cd "$(dirname "$0")"
set -e
set -o pipefail

echo "========================================="
echo "  Yarik Weather - Build & Deploy Backend"
echo "========================================="

cd ..

# ---- Weather backend ----
cd backend
echo "Deploying weather backend..."

echo "  → Vendoring Rust dependencies (offline build)…"
cargo vendor   # creates vendor/ and .cargo/config.toml

docker buildx build --platform linux/amd64 \
  -t cr.yandex/crp5q6mqrcrcaiah7fgf/yarik-weather:latest \
  --push \
  .

# Clean up vendored files after build (optional – saves space)
rm -rf vendor .cargo/config.toml

yc serverless container revision deploy \
  --container-name yarik-weather \
  --image cr.yandex/crp5q6mqrcrcaiah7fgf/yarik-weather:latest \
  --cores 1 \
  --memory 512MB \
  --execution-timeout 60s \
  --service-account-id ajetvd45epqtuua9l6ob

echo "Weather backend done"
cd ..

# ---- AI backend ----
cd backend/ai
echo "Deploying AI backend..."

echo "  → Downloading Python wheels (offline build)…"
mkdir -p wheels
venv/bin/pip download --dest wheels fastapi uvicorn pandas numpy requests scikit-learn lightgbm

docker buildx build --platform linux/amd64 \
  -t cr.yandex/crp5q6mqrcrcaiah7fgf/yaroslav-ai-weather:latest \
  --push \
  .

# Optional: clean up wheels
rm -rf wheels

yc serverless container revision deploy \
  --container-name yaroslav-ai-weather \
  --image cr.yandex/crp5q6mqrcrcaiah7fgf/yaroslav-ai-weather:latest \
  --cores 1 \
  --memory 256MB \
  --execution-timeout 60s \
  --service-account-id ajetvd45epqtuua9l6ob

cd ../..
echo "AI backend done"

# ---- Remove old Docker images ----
echo "Removing old images..."
for repo in yarik-weather yaroslav-ai-weather; do
  yc container image list --repository-name "crp5q6mqrcrcaiah7fgf/$repo" --format json \
    | jq -r '.[] | select(.tags[0] != "latest") | .id' \
    | while read id; do
        test -n "$id" && yc container image delete "$id"
    done
done

echo "Backend done"