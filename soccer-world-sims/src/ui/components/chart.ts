/**
 * Lightweight canvas line chart with a snapping crosshair, highlighted data points and a
 * single tooltip listing every series at that x. Long histories are min/max-decimated per
 * pixel column for drawing, while hover always reads the original data.
 */
export interface Series { label: string; color: string; values: (number | null)[]; width?: number }
export interface Band { from: number; to: number; label: string }
export interface TooltipRow { label: string; value: string; color?: string }
export interface ChartOptions {
  series: Series[];
  yMin: number; yMax: number;
  invert?: boolean;            // true: smaller values drawn higher (league positions)
  yTicks?: number[];
  yFormat?: (v: number) => string;
  bands?: Band[];              // horizontal bands (e.g. divisions on the pyramid chart)
  xTicks?: { index: number; label: string }[];
  title: (i: number) => string;
  rows: (i: number) => TooltipRow[];
  height?: number;
  ariaLabel: string;
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';

export function mountChart(host: HTMLElement, o: ChartOptions): () => void {
  host.classList.add('chart');
  host.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', o.ariaLabel);
  canvas.tabIndex = 0;
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  host.append(canvas, tip);
  const n = Math.max(...o.series.map(s => s.values.length), 0);
  const pad = { l: 40, r: 14, t: 10, b: 24 };
  let hover = -1, W = 0, H = 0;

  const x = (i: number) => pad.l + (n <= 1 ? 0.5 : i / (n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => {
    const t = (v - o.yMin) / (o.yMax - o.yMin || 1);
    return o.invert ? pad.t + t * (H - pad.t - pad.b) : H - pad.b - t * (H - pad.t - pad.b);
  };

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    W = host.clientWidth; H = o.height ?? 240;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const g = canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const grid = css('--grid'), axis = css('--text-muted'), surface = css('--surface-2');
    g.font = '11px system-ui, sans-serif';
    // bands
    if (o.bands) o.bands.forEach((b, k) => {
      const y1 = y(b.from), y2 = y(b.to);
      g.fillStyle = k % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0)';
      g.fillRect(pad.l, Math.min(y1, y2), W - pad.l - pad.r, Math.abs(y2 - y1));
      g.fillStyle = axis; g.textAlign = 'right';
      g.fillText(b.label, W - pad.r - 4, Math.min(y1, y2) + 12);
    });
    // grid + y ticks
    g.strokeStyle = grid; g.lineWidth = 1; g.fillStyle = axis; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (const t of o.yTicks ?? []) {
      const yy = Math.round(y(t)) + 0.5;
      g.beginPath(); g.moveTo(pad.l, yy); g.lineTo(W - pad.r, yy); g.stroke();
      g.fillText(o.yFormat ? o.yFormat(t) : String(t), pad.l - 6, yy);
    }
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (const t of o.xTicks ?? []) g.fillText(t.label, x(t.index), H - pad.b + 6);
    // series (decimated to ~1 point per pixel column with min/max preservation)
    for (const s of o.series) {
      g.strokeStyle = s.color; g.lineWidth = s.width ?? 2; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      let pen = false, lastCol = -1, colMin = 0, colMax = 0;
      const step = n > (W - pad.l - pad.r) * 2;
      for (let i = 0; i < s.values.length; i++) {
        const v = s.values[i];
        if (v === null || v === undefined || Number.isNaN(v)) { pen = false; continue; }
        const px = x(i), py = y(v);
        if (step) {
          const col = Math.round(px);
          if (col === lastCol && pen) { colMin = Math.min(colMin, py); colMax = Math.max(colMax, py); continue; }
          if (pen && colMax !== colMin) { g.lineTo(lastCol, colMin); g.lineTo(lastCol, colMax); }
          lastCol = col; colMin = colMax = py;
        }
        if (!pen) { g.moveTo(px, py); pen = true; } else g.lineTo(px, py);
      }
      g.stroke();
    }
    // crosshair + highlighted points
    if (hover >= 0) {
      const hx = Math.round(x(hover)) + 0.5;
      g.strokeStyle = axis; g.lineWidth = 1;
      g.beginPath(); g.moveTo(hx, pad.t); g.lineTo(hx, H - pad.b); g.stroke();
      for (const s of o.series) {
        const v = s.values[hover];
        if (v === null || v === undefined) continue;
        g.beginPath(); g.arc(x(hover), y(v), 5, 0, Math.PI * 2);
        g.fillStyle = s.color; g.fill();
        g.lineWidth = 2; g.strokeStyle = surface; g.stroke();
      }
    }
  }

  function showTip(i: number) {
    hover = i;
    draw();
    tip.replaceChildren();
    const h = document.createElement('div'); h.className = 'chart-tip-title'; h.textContent = o.title(i);
    tip.append(h);
    for (const r of o.rows(i)) {
      const row = document.createElement('div'); row.className = 'chart-tip-row';
      if (r.color) { const sw = document.createElement('span'); sw.className = 'swatch'; sw.style.background = r.color; row.append(sw); }
      const v = document.createElement('strong'); v.textContent = r.value;
      const l = document.createElement('span'); l.textContent = ' ' + r.label;
      row.append(v, l); tip.append(row);
    }
    tip.hidden = false;
    const tx = x(i);
    const tw = tip.offsetWidth;
    tip.style.left = Math.max(4, Math.min(W - tw - 4, tx + (tx > W / 2 ? -tw - 12 : 12))) + 'px';
    tip.style.top = '8px';
  }
  const indexAt = (clientX: number) => {
    const r = canvas.getBoundingClientRect();
    const t = (clientX - r.left - pad.l) / (W - pad.l - pad.r);
    return Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
  };
  canvas.addEventListener('pointermove', e => { if (n) showTip(indexAt(e.clientX)); });
  canvas.addEventListener('pointerleave', () => { hover = -1; tip.hidden = true; draw(); });
  canvas.addEventListener('keydown', e => {
    if (!n) return;
    if (e.key === 'ArrowRight') { showTip(Math.min(n - 1, (hover < 0 ? n - 1 : hover + 1))); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { showTip(Math.max(0, (hover < 0 ? n - 1 : hover - 1))); e.preventDefault(); }
  });
  canvas.addEventListener('blur', () => { hover = -1; tip.hidden = true; draw(); });
  const ro = new ResizeObserver(() => draw());
  ro.observe(host);
  draw();
  return () => ro.disconnect();
}
