#!/usr/bin/env bash
#
# Build the Customer app on EAS.
#
# WHY THIS EXISTS
#
# `npx eas build` cannot run without a logged-in Expo session, and this sandbox
# cannot log in: `eas login` wants a browser it does not have, or a prompt it
# cannot answer. So the token is read from a file *outside the repository* rather
# than from the chat, which keeps a working credential out of a transcript and out
# of a commit, and gives the build one obvious place to read it from.
#
# The token comes from expo.dev: Account Settings → Access Tokens → Generate a
# Token, with read/write scope. It looks like `eyJ…`.
#
# Once that file exists this script does the rest, in order, and stops at the
# first thing that is actually wrong rather than failing later in an upload:
#
#   1. refuses to run if the file is missing, and says how to make it
#   2. confirms the token is accepted before spending a build on it
#   3. `eas init` once, so the real projectId replaces the placeholder
#   4. `eas build` for the profile and platform asked for
#
# Usage:
#   scripts/eas-build.sh                      # development APK
#   scripts/eas-build.sh preview              # preview APK
#   scripts/eas-build.sh preview android
#   scripts/eas-build.sh production android

set -euo pipefail

PROFILE="${1:-development}"
PLATFORM="${2:-android}"
TOKEN_FILE="${EXPO_TOKEN_FILE:-$HOME/.expo-token}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Refuse to guess a build target. `srabon-telecom-customer` is the identity this
# APK is signed with; building it under any other EAS project produces a phone
# app belonging to something else, and the failure shows up after the upload
# rather than before it.
EXPECTED_SLUG='srabon-telecom-customer'

cd "$ROOT"

if [ ! -f "$TOKEN_FILE" ]; then
  cat >&2 <<EOF
[eas] No Expo token at $TOKEN_FILE

  This sandbox cannot run \`eas login\` — it has no browser, and the CLI login
  prompt needs a keyboard. So the token is read from a file instead.

  Get one from expo.dev:
    Account Settings → Access Tokens → Generate a Token   (read/write)

  Then, in THIS machine:
    printf '%s' 'eyJ...' > $TOKEN_FILE && chmod 600 $TOKEN_FILE

  An Expo token is not the UddoktaPay merchant key. That one is rejected by
  expo.dev, and it belongs in backend/.env as UDDOKTAPAY_API_KEY regardless.
EOF
  exit 1
fi

# Never echo the token, not even its length or a prefix, and never let a failure
# from the CLI print the environment it was exported into.
EXPO_TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"
if [ -z "$EXPO_TOKEN" ]; then
  echo "[eas] $TOKEN_FILE is empty" >&2
  exit 1
fi
export EXPO_TOKEN

echo "[eas] Checking the token is accepted…"
# 2. Fail here, for free, rather than after a multi-minute upload.
if ! npx --yes eas-cli@latest whoami; then
  cat >&2 <<EOF

[eas] That token was not accepted. It is probably expired, or it is a
      UddoktaPay key rather than an Expo one. Generate a new one at
      expo.dev → Account Settings → Access Tokens.
EOF
  exit 1
fi

ACTUAL_SLUG="$(node -e "
  const { getConfig } = require('@expo/config');
  process.stdout.write(String(getConfig(process.cwd()).exp.slug));
" 2>/dev/null || echo 'unknown')"

if [ "$ACTUAL_SLUG" != "$EXPECTED_SLUG" ]; then
  echo "[eas] This project is '$ACTUAL_SLUG', not '$EXPECTED_SLUG'." >&2
  echo "      Fix app.config.ts before building — the package and signature go with it." >&2
  exit 1
fi

# 3. Link once, so the placeholder projectId is replaced with a real one.
CURRENT_ID="$(node -e "
  const { getConfig } = require('@expo/config');
  process.stdout.write(String(getConfig(process.cwd()).exp.extra?.eas?.projectId || ''));
" 2>/dev/null || true)"

if [ "$CURRENT_ID" = "00000000-0000-0000-0000-000000000000" ] || [ -z "$CURRENT_ID" ]; then
  echo "[eas] No EAS project linked yet — running 'eas init' once…"
  npx --yes eas-cli@latest init
else
  echo "[eas] Project linked: $CURRENT_ID"
fi

echo "[eas] Building profile=$PROFILE platform=$PLATFORM…"
npx --yes eas-cli@latest build --profile "$PROFILE" --platform "$PLATFORM"
