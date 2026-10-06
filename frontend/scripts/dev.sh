#!/bin/bash
# ============================================================
#  Yarik Weather – local development server
#
#  Serves frontend/public on http://localhost:3000 (the port the
#  frontend/Caddyfile proxies to) and keeps a log in frontend/dev.log.
#  Edits to HTML/CSS/JS are picked up on reload — no build step.
#
#  Usage:  ./frontend/scripts/dev.sh [port]
# ============================================================
set -euo pipefail

FRONTEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC_DIR="$FRONTEND_DIR/public"
PORT="${1:-3000}"

cd "$FRONTEND_DIR"

echo "==> Serving $PUBLIC_DIR on http://localhost:$PORT"
echo "    (Ctrl+C to stop; log: frontend/dev.log)"
echo "    Weather data: api-ninjas, called from the browser — see public/js/api.js."
echo "    Override the key per load: http://localhost:$PORT/?key=<api-ninjas-key>"
echo "    or at runtime with YW.api.setApiKey('<key>') in the console."
echo "    Legacy: ?api=http://localhost:8081 targets the Rust backend instead."

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT" --directory "$PUBLIC_DIR" 2>&1 | tee dev.log
else
  echo "Error: python3 is required for the dev server" >&2
  exit 1
fi
