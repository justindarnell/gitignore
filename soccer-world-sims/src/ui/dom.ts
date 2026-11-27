import type { World } from '../engine/types.ts';

/** HTML-escape any text placed in templates. */
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** One decimal place maximum for displayed attributes (full precision kept internally). */
export const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
export const f0 = (x: number) => String(Math.round(x));
export const pct = (x: number) => `${Math.round(x)}%`;
export const signed = (x: number) => (x > 0 ? '+' : '') + x;

const failedCrests = new Set<string>();

/** Fallback initials for a club without a badge. */
export function initials(world: World, id: string): string {
  const info = world.info[id];
  const name = info?.short ?? world.season.externals[id]?.name ?? id;
  const words = name.replace(/&/g, ' ').split(/\s+/).filter(w => /^[A-Za-z]/.test(w));
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

/** Crest image (stable URL, browser-cached, lazy); initials when missing or external. */
export function crest(world: World, id: string, size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'sm'): string {
  const info = world.info[id];
  if (!info || failedCrests.has(id)) return `<span class="crest crest-${size} crest-fallback" aria-hidden="true">${esc(initials(world, id))}</span>`;
  const src = size === 'xl' || size === 'lg' ? `crests/192/${id}.webp` : `crests/${id}.webp`;
  return `<img class="crest crest-${size}" src="${src}" alt="" loading="lazy" decoding="async" data-crest="${esc(id)}" data-initials="${esc(initials(world, id))}">`;
}

/** Replace broken crest images by initials (error events captured globally). */
export function installCrestFallback(): void {
  document.addEventListener('error', (e) => {
    const img = e.target as HTMLImageElement;
    if (!(img instanceof HTMLImageElement) || !img.dataset.crest) return;
    failedCrests.add(img.dataset.crest);
    const span = document.createElement('span');
    span.className = img.className + ' crest-fallback';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = img.dataset.initials ?? '?';
    img.replaceWith(span);
  }, true);
}

/** Club name + crest, clickable to the profile (external qualifiers are not links). */
export function club(world: World, id: string, opts: { short?: boolean; crest?: 'xs' | 'sm' | 'md' | false; bold?: boolean } = {}): string {
  const info = world.info[id];
  const ext = world.season.externals[id];
  if (!info) return `<span class="club club-ext" title="Non-playable qualifying club">${crest(world, id, opts.crest || 'sm')}<span class="club-name">${esc(ext?.name ?? 'Qualifier')}</span><span class="tag">Q</span></span>`;
  const name = opts.short === false ? info.name : info.short;
  return `<a class="club${opts.bold ? ' strong' : ''}" href="#/club/${esc(id)}" title="${esc(info.name)}">${opts.crest === false ? '' : crest(world, id, opts.crest || 'sm')}<span class="club-name">${esc(name)}</span></a>`;
}

export function clubName(world: World, id: string, short = true): string {
  const i = world.info[id];
  return i ? (short ? i.short : i.name) : world.season.externals[id]?.name ?? id;
}

export function tabs(items: { id: string; label: string; href: string }[], active: string, cls = ''): string {
  return `<nav class="tabs ${cls}" role="tablist">${items.map(t => `<a role="tab" class="tab${t.id === active ? ' active' : ''}" aria-selected="${t.id === active}" href="${esc(t.href)}">${esc(t.label)}</a>`).join('')}</nav>`;
}

export function empty(msg: string): string { return `<div class="empty">${esc(msg)}</div>`; }

export function scoreText(hg: number, ag: number, et?: boolean, pens?: [number, number]): string {
  return `${hg}–${ag}${et ? ' <abbr title="after extra time">aet</abbr>' : ''}${pens ? ` <span class="pens">(${pens[0]}–${pens[1]} p)</span>` : ''}`;
}

export function bar(value: number, max = 100, cls = ''): string {
  const w = Math.max(0, Math.min(100, (value / max) * 100));
  return `<span class="meter ${cls}" role="img" aria-label="${f1(value)} of ${max}"><span style="width:${w.toFixed(1)}%"></span></span>`;
}
