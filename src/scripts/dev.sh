#!/bin/bash
# ============================================================
#  Yarik Weather – local development server
#
#  Serves the repository root on http://localhost:3000, which is
#  what index.html expects (it links to src/main.css, src/js/… and
#  src/assets/…). Edits to HTML/CSS/JS are picked up on reload —
#  no build step.
#
#  Usage:  ./src/scripts/dev.sh [port]
# ============================================================
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_DIR="$(cd "$SRC_DIR/.." && pwd)"
PORT="${1:-3000}"

cd "$ROOT_DIR"

echo "==> Serving $ROOT_DIR on http://localhost:$PORT"
echo "    (Ctrl+C to stop; log: dev.log)"
echo "    Weather data: Open-Meteo, called from the browser — see src/js/api.js."
echo "    No API key is needed; a paid key can still be added per load with"
echo "    http://localhost:$PORT/?key=<open-meteo-key> or YW.api.setApiKey('<key>')."
echo "    Legacy: ?api=http://localhost:8081 targets the Rust backend instead."

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT" --directory "$ROOT_DIR" 2>&1 | tee dev.log
else
  echo "Error: python3 is required for the dev server" >&2
  exit 1
fi
