#!/bin/bash
# launchd com.cerebralos.dispatch（120 秒間隔で `cerebralos dispatch run`）を作ってロードする。
# 使い方: bash scripts/install-dispatch-launchd.sh [--uninstall]
# ログ: ~/.cerebralos/.brain/dispatch.log（二重起動はアプリ側のロックで防ぐ）
set -euo pipefail
LABEL=com.cerebralos.dispatch
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
LOG="$HOME/.cerebralos/.brain/dispatch.log"
UID_N="$(id -u)"

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "gui/$UID_N/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"; echo "uninstalled $LABEL"; exit 0
fi

mkdir -p "$HOME/Library/LaunchAgents" "$(dirname "$LOG")"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$REPO/bin/cerebralos</string>
    <string>dispatch</string>
    <string>run</string>
  </array>
  <key>StartInterval</key><integer>120</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$(dirname "$NODE"):$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string></dict>
</dict>
</plist>
PL
plutil -lint "$PLIST" >/dev/null
launchctl bootout "gui/$UID_N/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_N" "$PLIST"
echo "loaded $LABEL (every 120s) → log: $LOG"
