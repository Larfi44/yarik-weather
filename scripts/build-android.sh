#!/bin/bash
cd "$(dirname "$0")/.."   # go to project root
set -e
set -o pipefail

# ---- Toolchain guards ----
# Gradle 8.x only accepts JDKs up to 24, while Homebrew's default `java` can be
# newer (JDK 27 here) — a plain `cargo tauri android build` then dies inside
# Gradle with "Unsupported class file major version". Pick the newest JDK the
# wrapper still supports when JAVA_HOME is not already set.
if [ -z "$JAVA_HOME" ]; then
    for v in 21 20 19 18 17; do
        candidate=$(/usr/libexec/java_home -v "$v" 2>/dev/null) || continue
        if [ -n "$candidate" ]; then
            export JAVA_HOME="$candidate"
            break
        fi
    done
fi
if [ -n "$JAVA_HOME" ]; then
    export PATH="$JAVA_HOME/bin:$PATH"
    echo "Using JDK: $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"
fi

# scripts/generate-icons.py re-encodes the master PNG with Pillow. Homebrew can
# point `python3` at a freshly installed minor version that has no Pillow yet
# (3.15 here) while the previous one (3.14) still does, so use the first
# interpreter that can actually import PIL instead of failing the build.
PYTHON=""
for candidate in python3 python3.14 python3.13 python3.12 python3.11 python3.10 python3.9; do
    resolved=$(command -v "$candidate" 2>/dev/null) || continue
    if "$resolved" -c 'import PIL' >/dev/null 2>&1; then
        PYTHON="$resolved"
        break
    fi
done
if [ -z "$PYTHON" ]; then
    echo "Error: no python3 with Pillow found (needed by scripts/generate-icons.py)." >&2
    echo "       Install it, e.g. python3 -m pip install --user pillow" >&2
    exit 1
fi
echo "Using Python: $PYTHON ($("$PYTHON" -c 'import PIL; print("Pillow", PIL.__version__)'))"

# apksigner ships with the SDK build-tools: use the newest version installed.
BUILD_TOOLS=$(ls -d "$HOME/Library/Android/sdk/build-tools"/* 2>/dev/null | sort -V | tail -1 || true)
if [ -z "$BUILD_TOOLS" ] || [ ! -x "$BUILD_TOOLS/apksigner" ]; then
    echo "Error: apksigner not found under $HOME/Library/Android/sdk/build-tools" >&2
    exit 1
fi

echo "========================================="
echo "  Yarik Weather – Android Build"
echo "========================================="

# ---- Frontend Build ----
echo "Building static frontend (index.html + src/ -> src/out)..."
bash src/scripts/build.sh

# No bundler involved: src/out/ is exactly what Tauri bundles (frontendDist).
echo "  Web assets prepared in src/out/"

# ---- Launcher icon ----
echo "Generating icons..."
"$PYTHON" scripts/generate-icons.py
echo "  Icons generated with cargo tauri icon"

# ---- Generate Android project with icons ----
export TAURI_ANDROID_AGP_VERSION=8.2.0
export TAURI_ANDROID_TARGETS="aarch64"
echo "Initializing Android project..."
rm -rf src-tauri/gen/android
cargo tauri android init

# ---- Build APK ----
echo "Building APK (aarch64)..."
CARGO_BUILD_JOBS=2 cargo tauri android build --target aarch64 2>&1 | tee /tmp/android-build.log

# ---- Sign ----
APK_PATH=$(find src-tauri/gen/android -name "*.apk" -type f | head -1)
if [ -z "$APK_PATH" ]; then
    echo "Error: No APK found after build"
    exit 1
fi
echo "Signing APK: $APK_PATH"

if [ ! -f ~/.android/debug.keystore ]; then
    keytool -genkey -v \
      -keystore ~/.android/debug.keystore \
      -storepass android \
      -alias androiddebugkey \
      -keypass android \
      -keyalg RSA -keysize 2048 -validity 10000 \
      -dname "CN=Android Debug,O=Android,C=US"
fi

"$BUILD_TOOLS/apksigner" sign \
  --ks ~/.android/debug.keystore \
  --ks-pass pass:android \
  --ks-key-alias androiddebugkey \
  --key-pass pass:android \
  --out yarik-weather.apk \
  "$APK_PATH"

# ---- Copy to downloads ----
# `downloads/` is the folder used for side-loading over adb, and the frontend
# build (src/scripts/build.sh) excludes it, so this one artifact is the only
# APK to install by hand. An older build left there once caused a stale APK to
# be flashed while the fresh one sat elsewhere — keep this copy authoritative.
cp yarik-weather.apk downloads/

# ---- Clean up the root copy ----
rm -f yarik-weather.apk

echo ""
echo "========================================="
echo "  ✅ Android .apk ready!"
echo "  downloads/yarik-weather.apk"
echo "========================================="