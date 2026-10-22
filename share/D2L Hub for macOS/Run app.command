#!/bin/bash
# Double-click this in Finder, or run: bash "./Run app.command"
# First run installs dependencies (a few minutes), then opens the app.

cd "$(dirname "$0")" || exit 1

pause() {
  echo
  read -r -p "Press Return to close this window…" _
}

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed."
  echo "Install the LTS version from https://nodejs.org, then run this again."
  pause
  exit 1
fi

echo "Node $(node -v) · npm $(npm -v)"
echo

if [ ! -d node_modules ]; then
  echo "First run: installing dependencies. This downloads ~300 MB and can take a few minutes…"
  echo
  if ! npm ci; then
    echo
    echo "Dependency install failed. Scroll up for the reason (usually an old Node version)."
    pause
    exit 1
  fi
fi

echo
echo "Building and starting D2L Hub…"
echo "Keep this window open while you use the app; it closes when you quit the app."
echo
npm run desktop
status=$?

echo
if [ $status -ne 0 ]; then
  echo "The app exited with an error (code $status). Scroll up for the details."
fi
pause
exit $status
