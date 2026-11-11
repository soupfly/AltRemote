#!/usr/bin/env bash
# Sets up a Linux Mint (21.x / 22.x) machine to build the AltRemote React Native Android app.
#
# Installs:
#   - Base tools: git, curl, unzip, build-essential, watchman (if available)
#   - OpenJDK 17 (required by React Native's Android Gradle plugin)
#   - Node.js LTS via nvm (no sudo needed for global npm packages)
#   - Android SDK command-line tools, platform-tools (adb), platform, build-tools, NDK
#   - udev rules so adb can see your phone over USB
#   - Optional: Android Studio (--with-studio) and KVM for the emulator (--with-emulator)
#
# Usage:
#   chmod +x setup-altremote-dev.sh
#   ./setup-altremote-dev.sh [--with-studio] [--with-emulator]
#
# Run as your normal user (not root). It will ask for sudo when needed.

set -euo pipefail

# ---------- Versions (edit here if needed) ----------
NODE_VERSION="lts/*"
NVM_VERSION="v0.40.3"
JDK_PACKAGE="openjdk-17-jdk"
ANDROID_PLATFORM="android-36"
ANDROID_BUILD_TOOLS="36.0.0"
ANDROID_NDK="27.1.12297006"
# From https://developer.android.com/studio#command-line-tools-only
CMDLINE_TOOLS_ZIP="commandlinetools-linux-13114758_latest.zip"
ANDROID_STUDIO_VERSION="2025.1.1.13"   # used only with --with-studio
ANDROID_HOME_DIR="$HOME/Android/Sdk"

WITH_STUDIO=false
WITH_EMULATOR=false
for arg in "$@"; do
  case "$arg" in
    --with-studio)   WITH_STUDIO=true ;;
    --with-emulator) WITH_EMULATOR=true ;;
    -h|--help)
      sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[warn] %s\033[0m\n' "$*"; }

if [[ $EUID -eq 0 ]]; then
  echo "Run this script as your normal user, not root." >&2
  exit 1
fi

if ! grep -qi "mint\|ubuntu" /etc/os-release; then
  warn "This script targets Linux Mint / Ubuntu. Continuing anyway."
fi

# ---------- 1. Base packages ----------
log "Installing base packages"
sudo apt-get update
sudo apt-get install -y \
  git curl wget unzip zip build-essential ca-certificates \
  "$JDK_PACKAGE" \
  android-sdk-platform-tools-common   # udev rules for Android devices

if apt-cache show watchman >/dev/null 2>&1; then
  sudo apt-get install -y watchman
else
  warn "watchman not available in apt; Metro will fall back to its own file watcher."
fi

# Raise the inotify watch limit so Metro doesn't hit ENOSPC on large projects
if ! grep -q "fs.inotify.max_user_watches" /etc/sysctl.conf 2>/dev/null; then
  log "Raising inotify watch limit"
  echo "fs.inotify.max_user_watches=524288" | sudo tee -a /etc/sysctl.conf >/dev/null
  sudo sysctl -p >/dev/null
fi

# ---------- 2. Java 17 ----------
log "Configuring Java 17"
# Point at JDK 17 explicitly, even if another JDK is the system default
JAVA17_HOME="$(ls -d /usr/lib/jvm/java-17-openjdk-* 2>/dev/null | head -n1 || true)"
if [[ -z "$JAVA17_HOME" || ! -x "$JAVA17_HOME/bin/javac" ]]; then
  echo "Could not find JDK 17 under /usr/lib/jvm after installing $JDK_PACKAGE." >&2
  exit 1
fi
echo "JAVA_HOME will be $JAVA17_HOME"

# ---------- 3. Node.js via nvm ----------
log "Installing nvm $NVM_VERSION and Node.js ($NODE_VERSION)"
export NVM_DIR="$HOME/.nvm"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
fi
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
nvm install "$NODE_VERSION"
nvm alias default "$NODE_VERSION"
node -v
npm -v

# ---------- 4. Android SDK ----------
log "Installing Android SDK command-line tools into $ANDROID_HOME_DIR"
mkdir -p "$ANDROID_HOME_DIR/cmdline-tools"
if [[ ! -x "$ANDROID_HOME_DIR/cmdline-tools/latest/bin/sdkmanager" ]]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  wget -q --show-progress -O "$tmp/cmdline-tools.zip" \
    "https://dl.google.com/android/repository/${CMDLINE_TOOLS_ZIP}"
  unzip -q "$tmp/cmdline-tools.zip" -d "$tmp"
  rm -rf "$ANDROID_HOME_DIR/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$ANDROID_HOME_DIR/cmdline-tools/latest"
fi

export JAVA_HOME="$JAVA17_HOME"
export ANDROID_HOME="$ANDROID_HOME_DIR"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

log "Accepting Android SDK licenses"
yes | sdkmanager --licenses >/dev/null || true

SDK_PACKAGES=(
  "platform-tools"
  "platforms;${ANDROID_PLATFORM}"
  "build-tools;${ANDROID_BUILD_TOOLS}"
  "ndk;${ANDROID_NDK}"
  "cmake;3.22.1"
)
if $WITH_EMULATOR; then
  SDK_PACKAGES+=("emulator" "system-images;${ANDROID_PLATFORM};google_apis;x86_64")
fi

log "Installing SDK packages: ${SDK_PACKAGES[*]}"
sdkmanager --install "${SDK_PACKAGES[@]}"

# ---------- 5. USB debugging access ----------
log "Adding $USER to the plugdev group (for adb over USB)"
sudo usermod -aG plugdev "$USER"

# ---------- 6. Optional: emulator / KVM ----------
if $WITH_EMULATOR; then
  log "Installing KVM for hardware-accelerated emulator"
  sudo apt-get install -y qemu-kvm libvirt-daemon-system cpu-checker
  sudo usermod -aG kvm "$USER"
  kvm-ok || warn "KVM acceleration unavailable. Enable virtualization (VT-x/AMD-V) in your BIOS."
  if ! avdmanager list avd | grep -q "AltRemote_Test"; then
    echo "no" | avdmanager create avd -n AltRemote_Test \
      -k "system-images;${ANDROID_PLATFORM};google_apis;x86_64" -d pixel_7 || \
      warn "Could not create the emulator image; create one in Android Studio instead."
  fi
fi

# ---------- 7. Optional: Android Studio ----------
if $WITH_STUDIO; then
  log "Installing Android Studio $ANDROID_STUDIO_VERSION to /opt/android-studio"
  if [[ ! -d /opt/android-studio ]]; then
    tmp_studio="$(mktemp -d)"
    wget -q --show-progress -O "$tmp_studio/studio.tar.gz" \
      "https://redirector.gvt1.com/edgedl/android/studio/ide-zips/${ANDROID_STUDIO_VERSION}/android-studio-${ANDROID_STUDIO_VERSION}-linux.tar.gz"
    sudo tar -xzf "$tmp_studio/studio.tar.gz" -C /opt
    rm -rf "$tmp_studio"
    mkdir -p "$HOME/.local/share/applications"
    cat > "$HOME/.local/share/applications/android-studio.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Android Studio
Exec=/opt/android-studio/bin/studio.sh
Icon=/opt/android-studio/bin/studio.svg
Categories=Development;IDE;
Terminal=false
EOF
  else
    echo "Android Studio already present in /opt/android-studio, skipping."
  fi
fi

# ---------- 8. Shell environment ----------
log "Writing environment variables to ~/.bashrc"
MARKER="# >>> AltRemote Android dev env >>>"
if ! grep -qF "$MARKER" "$HOME/.bashrc"; then
  cat >> "$HOME/.bashrc" <<EOF

$MARKER
export JAVA_HOME="$JAVA17_HOME"
export ANDROID_HOME="$ANDROID_HOME_DIR"
export PATH="\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/emulator:\$PATH"
# <<< AltRemote Android dev env <<<
EOF
fi

# ---------- 9. Summary ----------
log "Done. Installed versions:"
"$JAVA17_HOME/bin/java" -version 2>&1 | head -n1
echo "node $(node -v), npm $(npm -v)"
adb version | head -n1
echo "ANDROID_HOME=$ANDROID_HOME_DIR"

cat <<'EOF'

Next steps:
  1. Log out and back in (or reboot) so the plugdev/kvm group changes and ~/.bashrc take effect.
  2. On your phone: Settings > About phone > tap "Build number" 7 times,
     then Developer options > enable USB debugging.
  3. Plug the phone in and run:  adb devices   (accept the prompt on the phone)
  4. Make sure the phone and the Google TV are on the same Wi-Fi network.
EOF
