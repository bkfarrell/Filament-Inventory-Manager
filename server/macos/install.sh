#!/bin/bash
# Installs Track My Filament as a background service on macOS (a launchd agent): it starts
# when you log in and restarts if it ever stops. Run it again any time to update.
#
#   ./server/macos/install.sh            install / update and start
#   ./server/macos/install.sh uninstall  stop and remove the service (keeps your data)
#
# Optional settings:  PORT=8787  DATA_DIR="$HOME/Library/Application Support/TrackMyFilament"
set -euo pipefail

cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
LABEL="com.trackmyfilament.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

if [[ "${1:-}" == "uninstall" ]]; then
  launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Track My Filament service removed. Your data was not touched."
  exit 0
fi

NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then
  echo "Node.js isn't installed. Get the LTS version from https://nodejs.org and run this again."
  exit 1
fi
if ! "$NODE" -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=18)?0:1)'; then
  echo "Track My Filament needs Node.js 22.18 or newer (you have $("$NODE" --version))."
  echo "Install the current LTS from https://nodejs.org and run this again."
  exit 1
fi

PORT="${PORT:-8787}"
DATA_DIR="${DATA_DIR:-$HOME/Library/Application Support/TrackMyFilament}"
LOG="$HOME/Library/Logs/TrackMyFilament.log"
mkdir -p "$DATA_DIR" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

echo "Installing libraries and building the web app (this takes a minute)..."
npm install --no-fund --no-audit
npm run build:web

echo "Creating the HTTPS certificate (needed for phone cameras)..."
DATA_DIR="$DATA_DIR" ./server/make-cert.sh

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>--disable-warning=ExperimentalWarning</string>
    <string>--disable-warning=MODULE_TYPELESS_PACKAGE_JSON</string>
    <string>$ROOT/server/index.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>$PORT</string>
    <key>DATA_DIR</key><string>$DATA_DIR</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF

# Restart with the new settings/code.
launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"

HOSTNAME_LOCAL="$(scutil --get LocalHostName 2>/dev/null || hostname -s).local"
echo
echo "Track My Filament is running (home network only)."
echo "  On this Mac:          https://localhost:$PORT"
echo "  Phones & computers:   https://$HOSTNAME_LOCAL:$PORT"
echo "  Your data:            $DATA_DIR"
echo "  Log file:             $LOG"
echo
echo "To use it securely from your iPhone (needed for the camera), install the home"
echo "certificate once:  $DATA_DIR/tls/ca.crt"
echo "  1. AirDrop that file to your iPhone (or open https://$HOSTNAME_LOCAL:$PORT/ca.crt there)."
echo "  2. Settings → General → VPN & Device Management → install the downloaded profile."
echo "  3. Settings → General → About → Certificate Trust Settings → turn on"
echo "     \"Track My Filament Home CA\"."
echo
echo "If macOS asks whether \"node\" may accept incoming network connections, click Allow."
