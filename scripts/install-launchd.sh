#!/bin/bash
# install-launchd.sh — Register the CerebraLOS loops (nightly/weekly/monthly) with launchd.
#
# Generates plists from scripts/launchd/*.plist.template by filling in the
# current user's $HOME and the cerebralos binary path (resolved at install
# time via `which cerebralos`), then loads them into ~/Library/LaunchAgents.
#
# Usage: bash scripts/install-launchd.sh

set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "launchd is macOS-only, use cron. Example crontab entries:" >&2
  echo "  0 3 * * *   cerebralos sleep" >&2
  echo "  0 22 * * 0  cerebralos weekly" >&2
  echo "  0 22 1 * *  cerebralos monthly" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="${SCRIPT_DIR}/launchd"
DST_DIR="${HOME}/Library/LaunchAgents"

# Resolve the cerebralos binary dynamically (no hardcoded install prefix).
CEREBRALOS_BIN="$(command -v cerebralos || true)"
if [[ -z "$CEREBRALOS_BIN" ]]; then
  echo "error: cerebralos not found in PATH. Install it first: npm install -g cerebralos" >&2
  exit 1
fi
CEREBRALOS_BIN_DIR="$(dirname "$CEREBRALOS_BIN")"

# Ensure the destination and log directories exist before launchd needs them.
mkdir -p "$DST_DIR" "${HOME}/.cerebralos/.brain"

for name in com.cerebralos.sleep com.cerebralos.weekly com.cerebralos.monthly; do
  template="${SRC_DIR}/${name}.plist.template"
  plist="${DST_DIR}/${name}.plist"

  if [[ ! -f "$template" ]]; then
    echo "error: template not found: ${template}" >&2
    exit 1
  fi

  # Unload an existing agent before replacing it.
  if [[ -f "$plist" ]]; then
    launchctl unload "$plist" 2>/dev/null || true
  fi

  # Replace the DIR placeholder before the BIN placeholder (longest match first).
  sed \
    -e "s|CEREBRALOS_BIN_DIR_PLACEHOLDER|${CEREBRALOS_BIN_DIR}|g" \
    -e "s|CEREBRALOS_BIN_PLACEHOLDER|${CEREBRALOS_BIN}|g" \
    -e "s|HOME_PLACEHOLDER|${HOME}|g" \
    "$template" > "$plist"

  launchctl load "$plist"
  echo "loaded: ${name}"
done

echo ""
echo "Verify with: launchctl list | grep cerebralos"
