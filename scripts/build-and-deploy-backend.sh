#!/bin/bash
# ============================================================
#  LEGACY / OPT-IN — the website does not need this anymore.
#
#  The browser gets its weather straight from api-ninjas
#  (see frontend/README.md), and the Yandex Cloud containers
#  this script targets no longer exist, so the registry,
#  service-account and container details below must be
#  updated before it can work again. It is no longer called
#  by scripts/build-and-deploy.sh.
#
#  Only needed if you deploy the self-hosted Rust backend and
#  point the client at it with ?api=<url>.
# ============================================================
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

# ---- Remove old Docker images (non-fatal, with timeout) ----
echo "Removing old images..."
for repo in yarik-weather yaroslav-ai-weather; do
  yc container image list --repository-name "crp5q6mqrcrcaiah7fgf/$repo" --format json \
    | jq -r '.[] | select(.tags[0] != "latest") | .id' \
    | while read id; do
        test -n "$id" && (timeout 15 yc container image delete "$id" 2>/dev/null || true)
    done
done 2>/dev/null || true

# ---- Point the frontend at the freshly deployed container ----
# A serverless container keeps its id across revisions, and its public URL is
# https://<container-id>.containers.yandexcloud.net. Print both endpoints so the
# weather one can be copied into <meta name="yw-api-url"> in
# frontend/public/index.html (see also frontend/public/js/api.js).
#
# NOTE: this script still targets the ids of the (now deleted) cloud folder:
# registry crp5q6mqrcrcaiah7fgf and service account ajetvd45epqtuua9l6ob. Update
# them (and create a new folder/registry) before the next deploy.
for name in yarik-weather yaroslav-ai-weather; do
  id="$(yc serverless container get --name "$name" --format json 2>/dev/null | jq -r '.id // empty' || true)"
  test -n "$id" && echo "  $name endpoint: https://$id.containers.yandexcloud.net"
done

echo "Backend done"
