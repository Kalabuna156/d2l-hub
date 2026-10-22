#!/bin/bash
# Double-click this in Finder, or run: bash "./Build installers.command"
# Produces release/D2L Hub-<version>-mac-arm64.dmg and -mac-x64.dmg

cd "$(dirname "$0")" || exit 1

pause() {
  echo
  read -r -p "Press Return to close this window…" _
}

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org first."
  pause
  exit 1
fi

echo "Node $(node -v) · npm $(npm -v) · $(uname -m) Mac"
echo

if [ ! -d node_modules ]; then
  echo "Installing dependencies first (one time, ~300 MB)…"
  if ! npm ci; then
    echo "Dependency install failed. Scroll up for the reason."
    pause
    exit 1
  fi
fi

# Sanity checks first: these catch a broken download before the slow packaging.
echo
echo "Checking types and running the test suite (about a minute)…"
npm run typecheck
npm test
echo

echo "Building the Mac installers. This takes a few minutes…"
echo
# No Apple Developer certificate here, so skip the identity search.
if ! CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac; then
  echo
  echo "Build failed. If the error mentions codesign or xcrun, run:"
  echo "  xcode-select --install"
  echo "then try this script again."
  pause
  exit 1
fi

echo
echo "Done. The installers are in the release folder:"
ls -1 release/*.dmg 2>/dev/null || echo "  (no .dmg found — check the output above)"
echo
echo "To test one: double-click the .dmg, drag D2L Hub into Applications,"
echo "then right-click the app in Applications → Open."
echo "If macOS says the app is damaged, run this and open it again:"
echo '  xattr -cr "/Applications/D2L Hub.app"'
open release 2>/dev/null
pause
