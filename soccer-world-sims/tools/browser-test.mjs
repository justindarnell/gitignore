// End-to-end browser checks against the built offline distribution, opened via file://.
// Usage: node tools/build.mjs && node tools/browser-test.mjs [--shots <dir>]
// Uses the preinstalled Playwright Chromium. Fails on any console error or failed check.
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(join(root, 'dist', 'index.html')).href;
const shotsArg = process.argv.indexOf('--shots');
const shots = shotsArg > 0 ? process.argv[shotsArg + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
// Offline: block every non-file request.
await context.route('**/*', r => (r.request().url().startsWith('file:') || r.request().url().startsWith('blob:') || r.request().url().startsWith('data:')) ? r.continue() : r.abort());
const page = await context.newPage();
const errors = [], external = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
page.on('request', r => { const u = r.url(); if (!/^(file|blob|data):/.test(u)) external.push(u); });
const shot = async (name) => { if (shots) await page.screenshot({ path: join(shots, name + '.png'), fullPage: false }); };
const t = async (fn) => { const t0 = Date.now(); await fn(); return Date.now() - t0; };

// ---- load & overview
const loadMs = await t(async () => { await page.goto(url); await page.waitForSelector('.page-head h1'); });
check('loads from file:// and renders overview', (await page.textContent('#season-label')) === '2026/27', `${loadMs} ms`);
await page.waitForTimeout(300);
const crestsBuilt = existsSync(join(root, 'dist', 'crests'));
const crestsLoaded = await page.$$eval('img.crest', imgs => imgs.filter(i => i.complete && i.naturalWidth > 0).length);
const initialsShown = await page.$$eval('.crest-fallback', e => e.length);
if (crestsBuilt) check('club badges load as local images', crestsLoaded > 10, `${crestsLoaded} crests rendered`);
else check('club badges fall back to initials when crests are not generated', crestsLoaded === 0 && initialsShown > 10, `${initialsShown} initials badges (no crests in dist/)`);
await shot('01-overview-start');

// ---- matchday controls
const before = await page.textContent('#date-label');
await page.click('[data-sim="matchday"]');
await page.waitForFunction(b => document.querySelector('#date-label').textContent !== b, before);
check('Next matchday advances the calendar', true, `${before} → ${await page.textContent('#date-label')}`);
await page.click('[data-sim="month"]');
await page.waitForTimeout(200);

// ---- standings
await page.click('#nav a[data-page="standings"]');
await page.waitForSelector('table.standings');
const rows = await page.$$eval('table.standings tbody tr', r => r.length);
const played = await page.$eval('table.standings tbody tr td:nth-child(3)', td => Number(td.textContent));
check('Premier League table shows 20 clubs with played games', rows === 20 && played > 0, `rows ${rows}, P ${played}`);
const zones = await page.$$eval('.legend span', s => s.map(x => x.textContent.trim()).filter(Boolean));
check('zones legend present', zones.some(z => z.includes('Relegation')), zones.join(' | '));
check('title-race chart renders on the standings page', !!(await page.$('#chart-race canvas')));
await page.click('a.tab:has-text("Championship")');
await page.waitForFunction(() => document.querySelectorAll('table.standings tbody tr').length === 24);
check('Championship tab shows 24 clubs and play-off zone', (await page.$$('.pos.zone-playoff')).length >= 6);
await shot('02-standings-championship');

// ---- fixtures
await page.click('#nav a[data-page="fixtures"]');
await page.waitForSelector('.fixture');
const fx = await page.$$eval('.fixtures .fixture', f => f.length);
check('fixtures page lists a matchday', fx === 10, `${fx} fixtures`);
await page.click('.round-nav a[aria-label="Next matchday"]');
await page.waitForTimeout(100);
check('matchday navigation works', /fixtures\/ENG1\/\d+/.test(page.url()));

// ---- bulk simulation in the worker (rest of season) with progress overlay
const seasonMs = await t(async () => {
  await page.click('[data-sim="season"]');
  await page.waitForFunction(() => document.querySelector('#progress').hidden && !document.querySelector('[data-sim="season"]').disabled, null, { timeout: 60000 });
});
check('rest of season simulates in a worker', (await page.textContent('#date-label')).includes('complete'), `${seasonMs} ms`);
await page.click('#nav a[data-page="overview"]');
await page.waitForSelector('.summary-grid');
check('season review shows champions and cup winners', (await page.$$('.summary-item')).length === 7);
await shot('03-season-review');

// ---- cups
await page.click('#nav a[data-page="cups"]');
await page.waitForSelector('.tie');
check('cups page shows a winner', (await page.$$('.card.highlight')).length === 1);
const qualifiers = await page.$$eval('.club-ext', e => e.length);
check('non-playable FA Cup qualifiers are marked', qualifiers > 0, `${qualifiers} qualifier entries`);
await page.click('a.tab:has-text("Play-offs")');
await page.waitForSelector('.po-bracket');
check('play-off brackets render (4 divisions)', (await page.$$('.po-bracket')).length === 4);

// ---- multi-season bulk run, pause and resume
await page.fill('#sim-years', '100');
await page.click('[data-sim="years"]');
await page.waitForSelector('[data-action="sim-pause"]');
await page.waitForTimeout(300);
// Main-thread responsiveness while the worker simulates: worst event-loop delay over ~1 s.
const lag = await page.evaluate(() => new Promise(res => { let worst = 0, n = 0; const tick = () => { const t0 = performance.now(); setTimeout(() => { worst = Math.max(worst, performance.now() - t0); if (++n < 40) tick(); else res(Math.round(worst)); }, 20); }; tick(); }));
check('main thread stays responsive during bulk simulation', lag < 120, `worst timer delay ${lag} ms (20 ms requested)`);
await page.click('[data-action="sim-pause"]');
await page.waitForSelector('[data-action="sim-resume"]', { timeout: 20000 });
const pausedAt = await page.textContent('#season-label');
check('bulk run pauses at a consistent point', !!pausedAt, `paused in ${pausedAt}`);
const hundredMs = await t(async () => {
  await page.click('[data-action="sim-resume"]');
  await page.waitForFunction(() => document.querySelector('#progress').hidden, null, { timeout: 120000 });
});
const label = await page.textContent('#season-label');
check('100 seasons complete after pause + resume', label === '2126/27', `${label}, ${hundredMs} ms after resume`);

// ---- cancel leaves the world unchanged
await page.click('[data-sim="100"]');
await page.waitForSelector('[data-action="sim-cancel"]');
await page.waitForTimeout(300);
await page.click('[data-action="sim-cancel"]');
await page.waitForFunction(() => document.querySelector('#progress').hidden, null, { timeout: 20000 });
check('cancelling a bulk run keeps the world unchanged', (await page.textContent('#season-label')) === label);

// ---- club profile, graphs, decimals
await page.goto(url + '#/club/liverpool');
await page.waitForSelector('#chart-ratings canvas');
const decimals = await page.$$eval('.attrs dd > span:last-child', s => s.map(x => x.textContent));
check('attributes display at most one decimal place', decimals.every(d => /^\d{1,3}(\.\d)?$/.test(d)), decimals.join(', '));
check('club profile shows ownership ambition', /Ownership[\s\S]*(Wealthy|Steady|Cautious|Asset)/.test(await page.textContent('.owner-line')));
const allText = await page.textContent('#main');
check('no long floating-point numbers anywhere on the profile', !/\d+\.\d{3,}/.test(allText));
const canvas = await page.$('#chart-position canvas');
await canvas.scrollIntoViewIfNeeded();
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.waitForSelector('#chart-position .chart-tip:not([hidden])');
const tip = await page.textContent('#chart-position .chart-tip');
check('position graph shows crosshair tooltip on hover', /\d{4}\/\d{2}/.test(tip) && tip.includes('pyramid position'), tip.replace(/\s+/g, ' ').slice(0, 120));
await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.4);
const tip2 = await page.textContent('#chart-position .chart-tip');
check('tooltip follows the pointer across seasons', tip2 !== tip);
await page.click('[data-action="position-detail"][data-detail="matchday"]');
await page.waitForSelector('#chart-position canvas');
await shot('04-club-profile');
const rc = await page.$('#chart-ratings canvas');
await rc.scrollIntoViewIfNeeded();
const r2 = await rc.boundingBox();
await page.mouse.move(r2.x + r2.width * 0.3, r2.y + 50);
check('ratings graph tooltip lists overall, reputation and stability', /overall[\s\S]*reputation[\s\S]*stability/.test(await page.textContent('#chart-ratings .chart-tip')));
await page.screenshot({ path: shots ? join(shots, '05-profile-hover.png') : '/dev/null' }).catch(() => {});

// ---- club links from tables
check('club profile lists rivalries', (await page.textContent('#main')).includes('Merseyside derby'));
await page.goto(url + '#/standings/ENG1');
await page.waitForSelector('table.standings a.club');
await page.click('table.standings tbody tr:first-child a.club');
await page.waitForSelector('.profile-head');
check('club names in tables link to profiles', page.url().includes('#/club/'));

// ---- history
await page.goto(url + '#/history/honours/ENG1');
await page.waitForSelector('table');
const seasonsListed = await page.$$eval('.grid-2 section:first-child tbody tr', r => r.length);
check('roll of honour lists every completed season', seasonsListed === 101, `${seasonsListed} rows`);
await page.goto(url + '#/history/rankings/pyramid/10');
await page.waitForSelector('h2');
check('rise & fall rankings render', (await page.textContent('#main')).includes('Most improved'));
await page.goto(url + '#/history/records');
await page.waitForSelector('h2');
check('records page renders', (await page.textContent('#main')).includes('Longest title streak'));
await shot('06-history-records');

// ---- stories, eras, rivalries (0.6)
await page.goto(url + '#/season/2100');
await page.waitForSelector('h1');
check('season review shows the story of the season', (await page.$$('.story-list li')).length > 0, `${(await page.$$('.story-list li')).length} stories`);
check('season review shows a stored title-race chart', !!(await page.$('#chart-race-review canvas')));
await page.goto(url + '#/history/eras');
await page.waitForSelector('#chart-bump canvas');
const eraCount = await page.$$eval('.eras li', l => l.length);
check('eras & dynasties list eras and draw the decades bump chart', eraCount > 0, `${eraCount} eras`);
const bump = await page.$('#chart-bump canvas'); await bump.scrollIntoViewIfNeeded(); const bb = await bump.boundingBox();
await page.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
check('bump chart tooltip lists clubs by decade', /\d{4}s/.test(await page.textContent('#chart-bump .chart-tip')));
await page.goto(url + '#/history/rivalries');
await page.waitForSelector('table.rivalries');
check('rivalries list configured derbies with records', (await page.$$('table.rivalries tbody tr')).length >= 20);
await page.goto(url + '#/h2h/liverpool/everton');
await page.waitForSelector('.h2h-summary');
const meet = Number((await page.textContent('.h2h-summary')).match(/(\d+) meetings/)?.[1] ?? 0);
check('head-to-head page shows the Merseyside derby record', meet > 0, `${meet} meetings`);
await page.selectOption('select[data-change="h2h-b"]', 'manchester-united');
await page.waitForFunction(() => location.hash === '#/h2h/liverpool/manchester-united');
check('head-to-head club picker changes the pairing', (await page.textContent('.page-head')).includes('North West derby'));
await page.goto(url + '#/standings/ENG1/2090');
await page.waitForSelector('#chart-race canvas');
check('past-season standings show the stored title race', true);
await shot('08-eras');

// ---- news, settings
await page.goto(url + '#/news');
check('news page lists items', (await page.$$('.news-list li')).length > 10);
await page.goto(url + '#/settings');
await page.waitForSelector('input[type=range]');
await page.$eval('input[data-key="upsets"]', el => { el.value = '150'; el.dispatchEvent(new Event('change', { bubbles: true })); });
await page.waitForFunction(() => document.querySelector('.setting strong')?.textContent);
check('changing a setting is logged and restorable', (await page.textContent('#main')).includes('Settings history'));
await page.click('[data-action="restore-defaults"]');

// ---- saves (IndexedDB from file://) and reload
await page.goto(url + '#/saves');
await page.waitForSelector('[data-action="save-new"]');
await page.click('[data-action="save-new"]');
await page.waitForSelector('[data-action="load"]', { timeout: 10000 });
const slots = await page.$$eval('[data-action="load"]', b => b.length);
check('manual save to IndexedDB works from file://', slots >= 1, `${slots} slot(s)`);
await page.waitForTimeout(800);
await page.reload();
await page.waitForSelector('.page-head h1');
check('autosave restores the world after reload', (await page.textContent('#season-label')) === label);

// ---- sandbox: what-if, fork and compare (0.6)
await page.goto(url + '#/club/everton');
await page.waitForSelector('.whatif');
await page.click('.whatif summary');
await page.click('[data-action="whatif-event"][data-kind="crisis"]');
await page.waitForSelector('.timeline li.intervention');
check('what-if: injected event is flagged as a user intervention in the club timeline', (await page.$$eval('.timeline li.intervention', l => l.map(x => x.textContent).join('|'))).includes('User intervention: Institutional crisis'));
await page.fill('[data-whatif="attack"]', '95');
await page.click('[data-action="whatif-edit"]');
await page.waitForFunction(() => document.querySelectorAll('.whatif .timeline li').length >= 2);
check('what-if: attribute edit is applied and recorded', (await page.textContent('.attrs')).includes('95.0') && (await page.textContent('.intervention-flag')).includes('2'));
check('what-if: only the edited attribute is recorded', /Attributes edited: attack [\d.]+ → 95\.0$/.test((await page.$$eval('.whatif .timeline li', l => l[0].textContent.trim()))), await page.$$eval('.whatif .timeline li', l => l[0].textContent.trim()));
await page.goto(url + '#/saves');
await page.waitForSelector('[data-action="fork"]');
check('saves page lists interventions of the current world', (await page.textContent('#main')).includes('User interventions in this world'));
await page.goto(url + '#/compare');
await page.waitForSelector('[data-action="fork-compare"]');
await page.click('[data-action="fork-compare"]');
await page.waitForSelector('table.compare-champs', { timeout: 20000 });
const cmpText = await page.textContent('#main');
check('fork & compare: the fork is identical to its parent so far', cmpText.includes('B was forked from A') && cmpText.includes('identical in every season'), cmpText.match(/Relation:[^.]*\./)?.[0]);
await page.click('#nav a[data-page="overview"]');
await page.click('[data-sim="season"]');
await page.waitForFunction(() => document.querySelector('#progress').hidden && !document.querySelector('[data-sim="season"]').disabled, null, { timeout: 60000 });
await page.goto(url + '#/saves');
await page.waitForSelector('[data-action="load"]');
const forkId = await page.$$eval('[data-action="load"]', b => b.map(x => x.dataset.id).filter(id => id !== 'autosave').sort().at(-1));
await page.goto(url + '#/compare/' + forkId);
await page.waitForSelector('[data-action="compare-catchup"]', { timeout: 20000 });
await page.click('[data-action="compare-catchup"]');
await page.waitForFunction(() => !document.querySelector('[data-action="compare-catchup"]') && document.querySelector('table.compare-champs'), null, { timeout: 60000 });
const rowsCmp = await page.$$eval('table.compare-champs tbody tr', r => r.length);
check('compare: the other timeline catches up in a worker and both are compared season by season', rowsCmp >= 102, `${rowsCmp} seasons compared`);
check('compare: club graph shows both timelines', !!(await page.$('#chart-compare canvas')));
await shot('09-compare');

// ---- memory
const mem = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null);
check('JS heap after 101 seasons', mem === null || mem < 400, `${mem} MB`);

check('no requests left the machine (offline)', external.length === 0, external.slice(0, 3).join(', '));
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

// ---- narrow viewport
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(url + '#/standings/ENG1');
await page.waitForSelector('table.standings');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check('no horizontal page scroll at phone width', !overflow);
await shot('07-mobile-standings');

// ---- historical start: 1992/93 (0.6)
await page.setViewportSize({ width: 1400, height: 900 });
await page.goto(url + '#/saves');
await page.waitForSelector('[data-change="new-start"]');
await page.selectOption('[data-change="new-start"]', '1992');
page.once('dialog', d => d.accept());
await page.click('[data-action="new-world"]');
await page.waitForFunction(() => document.querySelector('#season-label').textContent === '1992/93');
await page.goto(url + '#/standings/ENG1');
await page.waitForSelector('table.standings');
const rows92 = await page.$$eval('table.standings tbody tr', r => r.length);
const tabs92 = await page.$$eval('.tabs a.tab', t => t.map(x => x.textContent.trim()));
check('1992/93 start: 22-club Premier League and era division names', rows92 === 22 && tabs92.includes('First Division') && tabs92.includes('Third Division'), `${rows92} clubs; ${tabs92.join(', ')}`);
await page.click('[data-sim="season"]');
await page.waitForFunction(() => document.querySelector('#progress').hidden && !document.querySelector('[data-sim="season"]').disabled, null, { timeout: 60000 });
await page.goto(url + '#/cups/LC');
await page.waitForSelector('.tie');
check('1992/93 start: League Cup with the era format', (await page.textContent('#main')).includes('Away goals count'));
await page.goto(url + '#/club/wimbledon');
await page.waitForSelector('#chart-position canvas');
check('1992/93 start: historical clubs have profiles and a 92-club pyramid', (await page.textContent('#main')).includes('92 = bottom of the Third Division'));
check('no console errors after the sandbox and 1992 checks', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
process.exit(failed.length ? 1 : 0);
