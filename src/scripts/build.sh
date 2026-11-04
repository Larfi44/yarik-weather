#!/bin/bash
# ============================================================
#  Yarik Weather – static site build
#
#  The site is plain HTML/CSS/JS (no bundler), so "building" means
#  assembling src/out: index.html (with its `src/` prefixes rewritten
#  to `./`, because the built tree is flat) plus js/, assets/ and
#  main.css. Local-only files (signing keys, downloads, editor junk)
#  stay behind.
#
#  Usage:  ./src/scripts/build.sh
#  Output: src/out   (used by Tauri, GitVerse Pages and the
#          branch-based deployment in scripts/deploy-gitverse.sh)
# ============================================================
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_DIR="$(cd "$SRC_DIR/.." && pwd)"
OUT_DIR="$SRC_DIR/out"

if [ ! -f "$ROOT_DIR/index.html" ]; then
  echo "Error: $ROOT_DIR/index.html not found" >&2
  exit 1
fi

echo "==> Building static site: index.html + src/ -> src/out/"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# The page shell keeps its "src/..." references for the dev server, which
# serves the repository root; the built copy is flat, so they become "./".
sed -e 's|"src/|"./|g' "$ROOT_DIR/index.html" > "$OUT_DIR/index.html"

copy_site() {
  rsync -a \
    --exclude 'out/' \
    --exclude 'scripts/' \
    --exclude 'README.md' \
    --exclude 'keystore.jks' \
    --exclude 'downloads/' \
    --exclude 'dev.log' \
    --exclude '.DS_Store' \
    "$SRC_DIR/" "$OUT_DIR/"
}

if command -v rsync >/dev/null 2>&1; then
  copy_site
else
  # Fallback for images without rsync: copy everything, then prune.
  cp -R "$SRC_DIR"/. "$OUT_DIR"/
  rm -rf "$OUT_DIR/out" "$OUT_DIR/scripts" "$OUT_DIR/README.md" \
    "$OUT_DIR/assets/keystore.jks" "$OUT_DIR/assets/downloads" "$OUT_DIR/dev.log"
  find "$OUT_DIR" -name '.DS_Store' -delete
fi

# GitVerse Pages: keep the platform from running Jekyll on plain files.
touch "$OUT_DIR/.nojekyll"

echo "  ✅ Built $(find "$OUT_DIR" -type f | wc -l | tr -d ' ') files into src/out/"

