import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';

/** Minimal worker pool: run(jobs) resolves with results in job order. */
export class Pool {
  constructor(size = cpus().length) {
    this.workers = Array.from({ length: size }, () => new Worker(new URL('./worker.mjs', import.meta.url), { execArgv: ['--experimental-strip-types', '--no-warnings'] }));
  }
  run(jobs, onDone) {
    return new Promise((resolve, reject) => {
      const results = new Array(jobs.length);
      let next = 0, finished = 0;
      if (!jobs.length) return resolve(results);
      const feed = (w) => {
        if (next >= jobs.length) return;
        const i = next++;
        w.once('message', (msg) => {
          if (!msg.ok) return reject(new Error(msg.error));
          results[i] = msg;
          finished++;
          onDone?.(finished, jobs.length);
          if (finished === jobs.length) resolve(results); else feed(w);
        });
        w.postMessage({ ...jobs[i], id: i });
      };
      this.workers.forEach(feed);
    });
  }
  close() { return Promise.all(this.workers.map(w => w.terminate())); }
}

export function aggregate(results) {
  const keys = new Set(results.flatMap(r => Object.keys(r.metrics)));
  const out = {};
  for (const k of keys) {
    const v = results.map(r => r.metrics[k]).filter(x => x !== undefined && !Number.isNaN(x));
    if (!v.length) continue;
    const s = [...v].sort((a, b) => a - b);
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    const q = p => s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
    out[k] = { mean: m, sd: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length), p10: q(0.1), p50: q(0.5), p90: q(0.9), n: v.length };
  }
  return out;
}

export const means = agg => Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, v.mean]));
