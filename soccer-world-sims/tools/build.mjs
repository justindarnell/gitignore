// Builds the self-contained offline distribution into dist/.
//   dist/index.html  dist/app.js  dist/styles.css  dist/crests/*.webp (if generated locally)
// app.js is a classic (non-module) script and the simulation worker is embedded as a string
// and started from a Blob URL, so the game runs when index.html is opened from disk (file://).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const minify = !process.argv.includes('--dev');
mkdirSync(dist, { recursive: true });
for (const f of ['app.js', 'styles.css', 'index.html']) rmSync(join(dist, f), { force: true });

const worker = await build({ entryPoints: [join(root, 'src/worker/sim-worker.ts')], bundle: true, format: 'iife', target: 'es2020', minify, write: false, legalComments: 'none' });
const workerSource = worker.outputFiles[0].text;

// Crest images are generated locally and never committed (licensing). The UI only requests
// crests that exist, so a build without them shows initials badges and makes no failing requests.
const crests = join(root, 'assets', 'crests');
const crestIds = existsSync(crests) ? readdirSync(crests).filter(f => f.endsWith('.webp')).map(f => f.replace(/\.webp$/, '')).sort() : [];

await build({
  entryPoints: [join(root, 'src/ui/main.ts')], bundle: true, format: 'iife', target: 'es2020', minify, sourcemap: false,
  outfile: join(dist, 'app.js'), legalComments: 'none',
  define: { __WORKER_SOURCE__: JSON.stringify(workerSource), __APP_VERSION__: JSON.stringify(pkg.version), __CREST_IDS__: JSON.stringify(crestIds) },
});
writeFileSync(join(dist, 'styles.css'), readFileSync(join(root, 'src/ui/styles.css')));
writeFileSync(join(dist, 'index.html'), readFileSync(join(root, 'src/ui/index.html')));

const n = crestIds.length;
rmSync(join(dist, 'crests'), { recursive: true, force: true });
if (n) cpSync(crests, join(dist, 'crests'), { recursive: true, filter: s => !s.endsWith('manifest.json') });
const size = f => (statSync(join(dist, f)).size / 1024).toFixed(0) + ' KB';
console.log(`dist/app.js ${size('app.js')} · styles.css ${size('styles.css')} · crests: ${n ? n + ' copied' : 'none (run npm run crests -- <pack-dir>; initials are shown instead)'}`);
