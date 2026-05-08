#!/bin/bash
cd "$(dirname "$0")"
set -e

echo "========================================="
echo "  Yarik Weather - Build & Deploy"
echo "========================================="

# ========== macOS ==========
echo "Building macOS..."
cargo build --release --features desktop 2>&1 | tail -1

echo "Packaging macOS..."
rm -rf YarikWeather.app YarikWeather-MacOS.dmg
mkdir -p YarikWeather.app/Contents/MacOS
mkdir -p YarikWeather.app/Contents/Resources
cp target/release/frontend YarikWeather.app/Contents/MacOS/YarikWeather
chmod +x YarikWeather.app/Contents/MacOS/YarikWeather
cp assets/favicon.svg YarikWeather.app/Contents/MacOS/
cp assets/icon.icns YarikWeather.app/Contents/Resources/

cat > YarikWeather.app/Contents/Info.plist << 'ENDPLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key><string>YarikWeather</string>
    <key>CFBundleIdentifier</key><string>com.yarikstudio.yarikweather</string>
    <key>CFBundleName</key><string>Yarik Weather</string>
    <key>CFBundleVersion</key><string>1.0</string>
    <key>CFBundleShortVersionString</key><string>1.0</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleIconFile</key><string>icon</string>
</dict>
</plist>
ENDPLIST

xattr -cr YarikWeather.app 2>/dev/null || true
create-dmg \
  --volname "YarikWeather" \
  --window-pos 200 120 \
  --window-size 800 400 \
  --icon-size 100 \
  --icon "YarikWeather.app" 200 190 \
  --hide-extension "YarikWeather.app" \
  --app-drop-link 600 185 \
  "YarikWeather-MacOS.dmg" \
  YarikWeather.app
echo "macOS DMG done"

# ========== Windows ==========
echo "Building Windows..."
export PATH="/opt/homebrew/opt/llvm/bin:$PATH"
cargo xwin build --release --target x86_64-pc-windows-msvc --features desktop 2>&1 | tail -1

echo "Packaging Windows..."
cp target/x86_64-pc-windows-msvc/release/frontend.exe YarikWeather-Windows.exe
echo "Windows EXE done"

# ========== Android ==========
echo "Building Android (Rust)..."
dx build --android 2>&1 | tail -3 || true

echo "Patching Android Gradle files..."
# Change AGP version
find target/dx -name "build.gradle.kts" -exec sed -i '' 's/8\.7\.0/8.5.0/g' {} \;
# Change Gradle wrapper version
find target/dx -name "gradle-wrapper.properties" -exec sed -i '' 's/gradle-9\.1\.0-bin/gradle-8.7-bin/g' {} \;

# Use local Gradle zip (offline)
ANDROID_APP_DIR="target/dx/frontend/debug/android/app"
cat > "$ANDROID_APP_DIR/gradle/wrapper/gradle-wrapper.properties" << 'WRAPPER'
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=file\:/Users/Yaroslav/Downloads/gradle-8.7-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
WRAPPER

# Fix manifest, styles and activity to avoid AppCompat dependency
cat > "$ANDROID_APP_DIR/app/src/main/AndroidManifest.xml" << 'XML'
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:label="Yarik Weather"
        android:hardwareAccelerated="true">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
XML

cat > "$ANDROID_APP_DIR/app/src/main/res/values/styles.xml" << 'XML'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="@android:style/Theme.DeviceDefault.NoActionBar" />
</resources>
XML

cat > "$ANDROID_APP_DIR/app/src/main/kotlin/dev/dioxus/main/WryActivity.kt" << 'KT'
package dev.dioxus.main

import android.app.Activity
import android.os.Bundle

abstract class WryActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
    }
}
KT

# Use installed SDK 35 / build-tools 35.0.1
cat > "$ANDROID_APP_DIR/app/build.gradle.kts" << 'GRADLE'
plugins {
    id("com.android.application")
}

android {
    namespace = "com.yourcompany.frontend"
    compileSdk = 35
    buildToolsVersion = "35.0.1"

    defaultConfig {
        applicationId = "com.yourcompany.frontend"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    sourceSets {
        getByName("main") {
            assets.srcDirs("src/main/assets")
            jniLibs.srcDirs("src/main/jniLibs")
        }
    }
}
GRADLE

# Point to local Android SDK
cat > "$ANDROID_APP_DIR/local.properties" << 'LOCAL'
sdk.dir=/Users/Yaroslav/Library/Android/sdk
LOCAL

echo "android.suppressUnsupportedCompileSdk=35" >> "$ANDROID_APP_DIR/gradle.properties"
echo "android.builder.sdkDownload=false" >> "$ANDROID_APP_DIR/gradle.properties"

echo "Building APK..."
cd "$ANDROID_APP_DIR"
chmod +x gradlew

# Run Gradle
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew assembleDebug 2>&1 | tail -5
cd "$OLDPWD"

# Find and copy APK
find target -name "*.apk" -exec cp {} assets/downloads/YarikWeather-Android.apk \;
echo "Android APK done"

# ========== Copy to downloads ==========
mkdir -p assets/downloads
cp YarikWeather-MacOS.dmg assets/downloads/
cp YarikWeather-Windows.exe assets/downloads/

# ========== Web ==========
echo "Building web..."
dx build --release --platform web 2>&1 | tail -1

echo "Preparing upload..."
mkdir -p target/dx/frontend/release/web/public/downloads
cp assets/downloads/YarikWeather-MacOS.dmg target/dx/frontend/release/web/public/downloads/
cp assets/downloads/YarikWeather-Windows.exe target/dx/frontend/release/web/public/downloads/
cp assets/downloads/YarikWeather-Android.apk target/dx/frontend/release/web/public/downloads/ 2>/dev/null || true

# ========== Upload ==========
echo "Uploading to Yandex..."
cd target/dx/frontend/release/web/public
aws s3 sync . s3://yarik-weather-app/ --endpoint-url=https://storage.yandexcloud.net --no-progress
cd "$OLDPWD"

# ========== Clean up ==========
rm -rf YarikWeather.app YarikWeather-MacOS.dmg YarikWeather-Windows.exe

echo ""
echo "========================================="
echo "  ✅ Done!"
echo "  https://yarik-weather-app.website.yandexcloud.net"
echo "========================================="