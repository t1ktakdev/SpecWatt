#!/bin/bash
# Capture a real screenshot from the connected Android device.
# Usage: android-screenshot.sh <name> [outdir]
set -eu
NAME="${1:?screenshot name required}"
OUT="${2:-/c/Users/user/Documents/ChatGPT/SpecWATT/outputs/v7-device-screenshots-2026-10-26}"
ADB="/c/Users/user/AppData/Local/Android/Sdk/platform-tools/adb.exe"
mkdir -p "$OUT"
"$ADB" exec-out screencap -p > "$OUT/$NAME.png"
echo "saved: outputs/v7-device-screenshots-2026-10-26/$NAME.png ($(stat -c %s "$OUT/$NAME.png") bytes)"
