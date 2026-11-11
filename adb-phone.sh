#!/usr/bin/env bash
# Reconnects adb to an Android phone over Wi-Fi (wireless debugging).
# Finds the current port automatically, since it changes every time
# wireless debugging restarts.
#
# Usage:
#   ./adb-phone.sh            connect (finds the phone on the network)
#   ./adb-phone.sh pair       pair a new phone (Developer options > Wireless debugging >
#                             Pair device with pairing code)
#   ./adb-phone.sh status     show connected devices

set -uo pipefail
export PATH="$HOME/Android/Sdk/platform-tools:$PATH"

PHONE_IP="${PHONE_IP:-192.168.0.22}"

find_ports() {
  # Prints every port advertised for $PHONE_IP, one per line, without duplicates.
  # $1 = service type, e.g. _adb-tls-connect._tcp
  # The phone can advertise stale entries (an old port, or a renamed "name (2)" service
  # after wireless debugging restarts), so callers should try each port in turn.
  {
    # Match "service-type <space> ip:port" anywhere on the line, so names with spaces work.
    adb mdns services 2>/dev/null | grep -F "$1" | grep -oE "${PHONE_IP//./\\.}:[0-9]+" | cut -d: -f2
    if command -v avahi-browse >/dev/null; then
      timeout 6 avahi-browse -rpt "$1" 2>/dev/null | awk -F';' -v ip="$PHONE_IP" \
        '$1 == "=" && $8 == ip { print $9 }'
    fi
  } | awk 'NF && !seen[$0]++'
}

case "${1:-connect}" in
  connect)
    if adb devices | grep -q "^${PHONE_IP}:[0-9]*[[:space:]]device"; then
      echo "Already connected:"; adb devices | grep "^${PHONE_IP}"; exit 0
    fi
    echo "Looking for $PHONE_IP on the network..."
    ports="$(find_ports _adb-tls-connect._tcp)"
    for port in $ports; do
      if timeout 10 adb connect "$PHONE_IP:$port" | grep -q "^connected to"; then
        echo "connected to $PHONE_IP:$port"
        adb devices -l | grep "^${PHONE_IP}:$port"
        exit 0
      fi
      echo "  port $port didn't answer (stale entry), trying the next one"
      adb disconnect "$PHONE_IP:$port" >/dev/null 2>&1
    done
    echo "Phone not found. Check that:"
    echo "  - Wireless debugging is ON (Settings > Developer options > Wireless debugging)"
    echo "  - The phone is on the same Wi-Fi and the screen is unlocked"
    echo "Or enter the port shown on that screen:  adb connect $PHONE_IP:<port>"
    exit 1
    ;;
  pair)
    echo "On the phone: Wireless debugging > Pair device with pairing code. Keep that popup open."
    echo "Looking for the pairing service..."
    port="$(find_ports _adb-tls-pairing._tcp | head -1)"
    if [[ -z "$port" ]]; then
      read -rp "Pairing port shown on the phone: " port
    fi
    adb pair "$PHONE_IP:$port"   # prompts for the 6-digit code
    "$0" connect
    ;;
  status)
    adb devices -l
    ;;
  *)
    sed -n '2,11p' "$0"; exit 1 ;;
esac
