import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CANDIDATES = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
};

function findBrowser() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const candidate of CANDIDATES[process.platform] ?? []) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const html = `<!doctype html>
<html><body style="margin:0;background:transparent">
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a99bff"/>
      <stop offset="0.5" stop-color="#6d5efc"/>
      <stop offset="1" stop-color="#3f2bb8"/>
    </linearGradient>
  </defs>
  <rect x="40" y="40" width="944" height="944" rx="212" fill="#0b0d14"/>
  <rect x="40" y="40" width="944" height="944" rx="212" fill="url(#g)" opacity="0.2"/>
  <rect x="40" y="40" width="944" height="944" rx="212" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="6"/>
  <text x="512" y="628" text-anchor="middle" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif"
        font-size="340" font-weight="700" letter-spacing="-16" fill="#ffffff">D2L</text>
  <rect x="286" y="708" width="452" height="16" rx="8" fill="url(#g)"/>
</svg>
</body></html>`;

const browserPath = findBrowser();
if (!browserPath) {
  console.error('No Chrome/Chromium found — install one or set CHROME_PATH to render the icon.');
  process.exit(1);
}

fs.mkdirSync('build', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: browserPath,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--hide-scrollbars'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  const target = path.resolve('build', 'icon.png');
  await page.screenshot({ path: target, omitBackground: true });
  console.log(`icon written to ${target}`);
} finally {
  await browser.close();
}
