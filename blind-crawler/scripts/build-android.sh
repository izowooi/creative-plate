#!/bin/sh
set -eu
cd "$(dirname "$0")/../android"
./gradlew assembleDebug --console=plain
mkdir -p ../artifacts
cp app/build/outputs/apk/debug/app-debug.apk ../artifacts/blind-notifier.apk
