#!/usr/bin/env python3
"""
generate-icons.py — Generate all platform icons from frontend/public/favicon.svg

Uses PIL to render the SVG to a 1024x1024 master PNG, then invokes
`cargo tauri icon` to produce all required icon formats.
"""

import os, sys, subprocess, tempfile
from PIL import Image

SOURCE = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "favicon.svg")
TEMP_MASTER = "/tmp/yarik-weather-icon-master.png"
ICONS_DIR = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "icons")

if not os.path.isfile(SOURCE):
    print(f"ERROR: Source icon not found: {SOURCE}", file=sys.stderr)
    sys.exit(1)

print(f"  Source: {SOURCE}")

# Step 1: Use ImageMagick to render SVG to PNG (PIL can't read SVG directly)
if os.system(f"magick convert -background none -density 300 \"{SOURCE}\" -resize 1024x1024 -alpha on \"{TEMP_MASTER}\" 2>/dev/null") != 0:
    # Fallback: try with just 'convert' 
    os.system(f"convert -background none -density 300 \"{SOURCE}\" -resize 1024x1024 -alpha on \"{TEMP_MASTER}\"")

# Ensure master was created
if not os.path.isfile(TEMP_MASTER):
    print(f"ERROR: Failed to render SVG to PNG", file=sys.stderr)
    sys.exit(1)

# Step 2: Convert to ensure RGBA format
img = Image.open(TEMP_MASTER).convert("RGBA")
img.save(TEMP_MASTER)
print(f"  Master: 1024x1024 RGBA")

# Step 3: Remove old icons
if os.path.isdir(ICONS_DIR):
    for f in os.listdir(ICONS_DIR):
        fp = os.path.join(ICONS_DIR, f)
        if os.path.isfile(fp) and f != ".gitkeep":
            os.remove(fp)
os.makedirs(ICONS_DIR, exist_ok=True)

# Step 4: Use cargo tauri icon to generate all formats
print("  Running: cargo tauri icon ...")
result = subprocess.run(
    ["cargo", "tauri", "icon", TEMP_MASTER, "--output", ICONS_DIR],
    capture_output=True, text=True,
    cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)

if result.returncode != 0:
    print(f"ERROR: cargo tauri icon failed:\n{result.stderr}", file=sys.stderr)
    sys.exit(1)

for line in result.stdout.splitlines():
    if line.strip():
        print(f"  {line}")

print("  Icons generated successfully!")
os.remove(TEMP_MASTER)