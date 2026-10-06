#!/bin/bash
# ============================================================
#  Yarik Weather – static site build
#
#  The frontend is plain HTML/CSS/JS (no bundler), so "building"
#  means copying frontend/public into frontend/out while leaving
#  local-only files (signing keys, downloads, editor junk) behind.
#
#  Usage:  ./frontend/scripts/build.sh
#  Output: frontend/out   (used by Tauri, GitVerse Pages and the
#          branch-based deployment in scripts/deploy-gitverse.sh)
# ============================================================
set -euo pipefail

FRONTEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC_DIR="$FRONTEND_DIR/public"
OUT_DIR="$FRONTEND_DIR/out"

if [ ! -f "$PUBLIC_DIR/index.html" ]; then
  echo "Error: $PUBLIC_DIR/index.html not found" >&2
  exit 1
fi

echo "==> Building static site: public/ -> out/"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

copy_site() {
  rsync -a \
    --exclude 'keystore.jks' \
    --exclude 'downloads/' \
    --exclude 'dev.log' \
    --exclude '.DS_Store' \
    "$PUBLIC_DIR/" "$OUT_DIR/"
}

if command -v rsync >/dev/null 2>&1; then
  copy_site
else
  # Fallback for images without rsync: copy everything, then prune.
  cp -R "$PUBLIC_DIR"/. "$OUT_DIR"/
  rm -rf "$OUT_DIR/keystore.jks" "$OUT_DIR/downloads" "$OUT_DIR/dev.log"
  find "$OUT_DIR" -name '.DS_Store' -delete
fi

# GitVerse Pages: keep the platform from running Jekyll on plain files.
touch "$OUT_DIR/.nojekyll"

echo "  ✅ Built $(find "$OUT_DIR" -type f | wc -l | tr -d ' ') files into frontend/out/"
