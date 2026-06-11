#!/bin/bash
cd "$(dirname "$0")"
set -e
set -o pipefail

echo "========================================="
echo "  Yarik Weather - Build & Deploy Frontend"
echo "========================================="
echo ""

# ---- MacOS Desktop ----
echo ">>> Building MacOS..."
./build-and-deploy-macos.sh
echo ""

# ---- Windows Desktop ----
echo ">>> Building Windows..."
./build-and-deploy-windows.sh
echo ""

# ---- Android Mobile ----
echo ">>> Building Android..."
./build-and-deploy-android.sh
echo ""