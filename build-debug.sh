#!/usr/bin/env bash
# Builds the debug APK on a low-RAM machine without freezing it.
#
# A watchdog checks free memory every 2 seconds. If available RAM drops below
# MIN_FREE_MB, it stops the build (Gradle + compilers) before the system freezes.
#
# Usage: ./build-debug.sh            (log: build-debug.log)
#        ./build-debug.sh app:testDebugUnitTest   (any Gradle task)
#        MIN_FREE_MB=400 ./build-debug.sh

set -uo pipefail
cd "$(dirname "$0")"

MIN_FREE_MB="${MIN_FREE_MB:-300}"
LOG="build-debug.log"

export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
# shellcheck source=/dev/null
[[ -s "$HOME/.nvm/nvm.sh" ]] && . "$HOME/.nvm/nvm.sh" >/dev/null

if pgrep -f "qemu-system" >/dev/null; then
  echo "The Android emulator is running. Close it first; there isn't enough RAM for both." >&2
  exit 1
fi
if pgrep -f "react-native start|metro" >/dev/null; then
  echo "Note: Metro is running and uses ~300-500 MB. Consider stopping it during the build."
fi

avail_mb() { awk '/MemAvailable/ { print int($2 / 1024) }' /proc/meminfo; }

echo "Building (log: $LOG). Free RAM now: $(avail_mb) MB, watchdog stops the build below ${MIN_FREE_MB} MB."
(cd android && ./gradlew ${*:-app:assembleDebug} --console=plain) >"$LOG" 2>&1 &
BUILD_PID=$!

low_count=0
min_seen=$(avail_mb)
while kill -0 "$BUILD_PID" 2>/dev/null; do
  a=$(avail_mb)
  (( a < min_seen )) && min_seen=$a
  if (( a < MIN_FREE_MB )); then
    low_count=$((low_count + 1))
  else
    low_count=0
  fi
  # Two low readings in a row (4 s) -> stop before the machine locks up.
  if (( low_count >= 2 )); then
    echo "WATCHDOG: only ${a} MB free. Stopping the build to avoid a freeze." | tee -a "$LOG"
    pkill -f "clang|ninja" 2>/dev/null
    (cd android && ./gradlew --stop >/dev/null 2>&1)
    kill "$BUILD_PID" 2>/dev/null
    wait "$BUILD_PID" 2>/dev/null
    echo "Lowest free RAM: ${min_seen} MB. Close other apps (browser) and try again."
    exit 2
  fi
  sleep 2
done

wait "$BUILD_PID"
status=$?
# Free the Gradle daemon's memory once the build is done.
(cd android && ./gradlew --stop >/dev/null 2>&1)

grep -E "BUILD (SUCCESSFUL|FAILED)" "$LOG" | tail -1
echo "Lowest free RAM during build: ${min_seen} MB"
if (( status == 0 )) && [[ $# -eq 0 ]]; then
  echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
elif (( status == 0 )); then
  :
else
  grep -E "^e: |error:|What went wrong" -A3 "$LOG" | head -30
fi
exit "$status"
