import fs from 'node:fs';
import { build } from 'esbuild';

fs.rmSync('dist-server', { recursive: true, force: true });

await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: 'dist-server/index.mjs',
  // Loaded from node_modules at runtime so Electron keeps using the same copies.
  // pdfjs is here because its worker is loaded from its own folder, which only
  // exists when the package is left whole.
  external: ['express', 'cheerio', 'puppeteer-core', 'node-ical', 'pdfjs-dist'],
  logLevel: 'info',
});

console.log('server bundle written to dist-server/index.mjs');
