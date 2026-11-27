// Converts the FootyLogos SVG crest pack into small WebP images.
//
// Usage: node tools/assets/convert-crests.mjs <dir-containing-extracted-pack-folders>
//   The directory must contain the five extracted pack folders:
//   premier-league, efl-championship, efl-league-one, efl-league-two, national-league
//
// Output: assets/crests/<club-id>.webp (96x96) and assets/crests/192/<club-id>.webp (192x192),
//         assets/crests/manifest.json (source file, byte sizes, credit).
// Rendering uses headless Chromium; SVGs are loaded through <img>, which never executes scripts.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // preinstalled globally
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { master } from '../ratings/master.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = process.argv[2];
if (!src) { console.error('usage: convert-crests.mjs <pack-dir>'); process.exit(1); }
const packs = { 1: 'premier-league', 2: 'efl-championship', 3: 'efl-league-one', 4: 'efl-league-two', 5: 'national-league' };
const outDir = join(root, 'assets', 'crests');
mkdirSync(join(outDir, '192'), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
const manifest = { source: 'FootyLogos.com 2026-27 competition packs (SVG)', credit: 'Crests via FootyLogos.com (https://www.footylogos.com/). Club marks belong to their respective owners.', crests: {} };
for (const c of master) {
  const file = join(src, packs[c.div], c.crest);
  if (!existsSync(file)) { console.warn('missing', c.id); continue; }
  const svg = readFileSync(file);
  const dataUrl = 'data:image/svg+xml;base64,' + svg.toString('base64');
  const outputs = await page.evaluate(async ({ dataUrl }) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const res = {};
    for (const size of [96, 192]) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const ctx = cv.getContext('2d');
      const pad = size * 0.04;
      const w = img.naturalWidth || 512, h = img.naturalHeight || 512;
      const s = Math.min((size - 2 * pad) / w, (size - 2 * pad) / h);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (size - w * s) / 2, (size - h * s) / 2, w * s, h * s);
      res[size] = cv.toDataURL('image/webp', 0.88);
    }
    return res;
  }, { dataUrl });
  const b96 = Buffer.from(outputs[96].split(',')[1], 'base64');
  const b192 = Buffer.from(outputs[192].split(',')[1], 'base64');
  writeFileSync(join(outDir, `${c.id}.webp`), b96);
  writeFileSync(join(outDir, '192', `${c.id}.webp`), b192);
  manifest.crests[c.id] = { sourceFile: `${packs[c.div]}/${c.crest}`, svgBytes: statSync(file).size, webp96Bytes: b96.length, webp192Bytes: b192.length };
}
await browser.close();
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
const tot = Object.values(manifest.crests).reduce((a, x) => ({ svg: a.svg + x.svgBytes, w96: a.w96 + x.webp96Bytes, w192: a.w192 + x.webp192Bytes }), { svg: 0, w96: 0, w192: 0 });
console.log(`converted ${Object.keys(manifest.crests).length} crests; SVG ${(tot.svg / 1024).toFixed(0)} KB -> WebP96 ${(tot.w96 / 1024).toFixed(0)} KB, WebP192 ${(tot.w192 / 1024).toFixed(0)} KB`);
