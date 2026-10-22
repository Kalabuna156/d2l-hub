import fs from 'node:fs';

const WINDOWS_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  'C:\\Program Files\\Chromium\\Application\\chrome.exe',
];

const MAC_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  // Per-user installs on macOS.
  `${process.env.HOME ?? ''}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
  `${process.env.HOME ?? ''}/Applications/Chromium.app/Contents/MacOS/Chromium`,
  `${process.env.HOME ?? ''}/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`,
];

const LINUX_CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  '/usr/bin/microsoft-edge-stable',
  '/usr/bin/brave-browser',
  '/snap/bin/chromium',
  '/var/lib/flatpak/exports/bin/com.google.Chrome',
];

function candidatesForPlatform(): string[] {
  if (process.platform === 'win32') return WINDOWS_CANDIDATES;
  if (process.platform === 'darwin') return MAC_CANDIDATES;
  return LINUX_CANDIDATES;
}

/** Locate a Chromium browser already installed on the machine (no browser download needed). */
export function findChrome(): string | null {
  const fromEnv = process.env.CHROME_PATH?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  for (const candidate of candidatesForPlatform()) {
    if (!candidate) continue;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Message shown when no Chromium browser is installed. */
export function chromeInstallHint(): string {
  if (process.platform === 'darwin') {
    return 'Install Google Chrome, Chromium, Edge or Brave, or set CHROME_PATH to the browser binary.';
  }
  if (process.platform === 'linux') {
    return 'Install Google Chrome, Chromium (chromium or chromium-browser), Edge or Brave, or set CHROME_PATH.';
  }
  return 'Install Google Chrome, Edge or Brave, or set CHROME_PATH to the browser executable.';
}
