#!/bin/bash
# Xcode drops empty com.apple.security.application-groups when signing.
# The v2 profile includes that key (empty) until group.com.sbuffose.golflet exists.
# Re-sign so ASC sees the empty array. Only application-groups is emptied —
# associated-domains stays on the app and is never written onto the widget.
set -euo pipefail

APPLINKS="applinks:golflet.vercel.app"

empty_application_groups() {
  local plist="$1"
  if /usr/libexec/PlistBuddy -c 'Print :com.apple.security.application-groups' "$plist" >/dev/null 2>&1; then
    while /usr/libexec/PlistBuddy -c 'Print :com.apple.security.application-groups:0' "$plist" >/dev/null 2>&1; do
      /usr/libexec/PlistBuddy -c 'Delete :com.apple.security.application-groups:0' "$plist"
    done
  else
    /usr/libexec/PlistBuddy -c 'Add :com.apple.security.application-groups array' "$plist"
  fi
  if /usr/libexec/PlistBuddy -c 'Print :com.apple.security.application-groups:0' "$plist" >/dev/null 2>&1; then
    echo "Do not claim group.com.sbuffose.golflet until it exists on the portal."
    exit 1
  fi
}

keep_app_associated_domains() {
  local plist="$1"
  if ! /usr/libexec/PlistBuddy -c 'Print :com.apple.developer.associated-domains' "$plist" >/dev/null 2>&1; then
    /usr/libexec/PlistBuddy -c 'Add :com.apple.developer.associated-domains array' "$plist"
  fi
  local found=0
  local i=0
  local val
  while val=$(/usr/libexec/PlistBuddy -c "Print :com.apple.developer.associated-domains:$i" "$plist" 2>/dev/null); do
    if [ "$val" = "$APPLINKS" ]; then
      found=1
    fi
    i=$((i + 1))
  done
  if [ "$found" -eq 0 ]; then
    /usr/libexec/PlistBuddy -c "Add :com.apple.developer.associated-domains:$i string $APPLINKS" "$plist"
  fi
}

strip_associated_domains() {
  local plist="$1"
  if /usr/libexec/PlistBuddy -c 'Print :com.apple.developer.associated-domains' "$plist" >/dev/null 2>&1; then
    /usr/libexec/PlistBuddy -c 'Delete :com.apple.developer.associated-domains' "$plist"
  fi
}

inject() {
  local target="$1"
  local kind="$2"
  local out="$RUNNER_TEMP/$(basename "$target").keep-groups.plist"
  codesign -d --entitlements :- "$target" 2>/dev/null > "$out"
  empty_application_groups "$out"
  if [ "$kind" = "app" ]; then
    keep_app_associated_domains "$out"
  else
    strip_associated_domains "$out"
  fi
  codesign --force --sign "iPhone Distribution" \
    --keychain "$KEYCHAIN_PATH" \
    --entitlements "$out" \
    --timestamp \
    --generate-entitlement-der \
    "$target"
  echo "Kept empty application-groups on $target ($kind)"
  if [ "$kind" = "app" ]; then
    echo "Kept $APPLINKS on $target"
  fi
}

if [ "$#" -eq 1 ] && [ -d "$1/Payload" ]; then
  inject "$1/Payload/Golflet.app/PlugIns/GolfletWidgets.appex" widget
  inject "$1/Payload/Golflet.app" app
  exit 0
fi

if [ "$#" -eq 1 ] && [ -d "$1/PlugIns/GolfletWidgets.appex" ]; then
  inject "$1/PlugIns/GolfletWidgets.appex" widget
  inject "$1" app
  exit 0
fi

echo "Usage: keep-empty-app-groups.sh <Golflet.app | unpacked-ipa-dir>" >&2
exit 1
