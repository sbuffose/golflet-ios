#!/bin/bash
# Xcode drops empty com.apple.security.application-groups when signing.
# The v2 profile includes that key (empty) until group.com.sbuffose.golflet exists.
# Re-sign the target with the empty array so ASC does not reject the IPA.
set -euo pipefail

inject() {
  local target="$1"
  local out="$RUNNER_TEMP/$(basename "$target").keep-groups.plist"
  codesign -d --entitlements :- "$target" 2>/dev/null > "$out"
  if ! /usr/libexec/PlistBuddy -c 'Print :com.apple.security.application-groups' "$out" >/dev/null 2>&1; then
    /usr/libexec/PlistBuddy -c 'Add :com.apple.security.application-groups array' "$out"
  fi
  if /usr/libexec/PlistBuddy -c 'Print :com.apple.security.application-groups:0' "$out" >/dev/null 2>&1; then
    echo "Do not claim group.com.sbuffose.golflet until it exists on the portal."
    exit 1
  fi
  codesign --force --sign "iPhone Distribution" \
    --keychain "$KEYCHAIN_PATH" \
    --entitlements "$out" \
    --timestamp \
    --generate-entitlement-der \
    "$target"
  echo "Kept empty application-groups on $target"
}

if [ "$#" -eq 1 ] && [ -d "$1/Payload" ]; then
  inject "$1/Payload/Golflet.app/PlugIns/GolfletWidgets.appex"
  inject "$1/Payload/Golflet.app"
  exit 0
fi

if [ "$#" -eq 1 ] && [ -d "$1/PlugIns/GolfletWidgets.appex" ]; then
  inject "$1/PlugIns/GolfletWidgets.appex"
  inject "$1"
  exit 0
fi

echo "Usage: keep-empty-app-groups.sh <Golflet.app | unpacked-ipa-dir>" >&2
exit 1
