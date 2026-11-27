// Persistent saves in IndexedDB (large worlds), with export/import as a fallback for
// browsers that restrict storage for pages opened from local files.
import type { World } from '../engine/types.ts';
import { saveMeta, upgradeWorld, exportWorld, importWorld, type SaveMeta } from '../persistence/save.ts';

const DB = 'soccer-world-sims', STORE = 'saves', META = 'meta';
let dbp: Promise<IDBDatabase> | null = null;
export let storageError: string | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { const db = req.result; db.createObjectStore(STORE); db.createObjectStore(META); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
  dbp.catch(e => { storageError = `Browser storage unavailable (${(e as Error)?.message ?? e}). Use Export/Import to keep your worlds.`; });
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export async function listSaves(): Promise<SaveMeta[]> {
  const all = await tx<SaveMeta[]>(META, 'readonly', s => s.getAll() as IDBRequest<SaveMeta[]>);
  return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function writeSave(world: World, id: string, name?: string): Promise<SaveMeta> {
  const meta = saveMeta(world, id);
  if (name) meta.name = name;
  // Store a plain JSON string: compact, and immune to structured-clone surprises.
  const text = exportWorld(world);
  meta.bytes = text.length;
  await tx(STORE, 'readwrite', s => s.put(text, id));
  await tx(META, 'readwrite', s => s.put(meta, id));
  return meta;
}

export async function readSave(id: string): Promise<World> {
  const v = await tx<unknown>(STORE, 'readonly', s => s.get(id));
  if (!v) throw new Error('Save not found');
  return typeof v === 'string' ? importWorld(v) : upgradeWorld(v);
}

export async function deleteSave(id: string): Promise<void> {
  await tx(STORE, 'readwrite', s => s.delete(id));
  await tx(META, 'readwrite', s => s.delete(id));
}

export async function renameSave(id: string, name: string): Promise<void> {
  const m = await tx<SaveMeta>(META, 'readonly', s => s.get(id) as IDBRequest<SaveMeta>);
  if (m) { m.name = name; await tx(META, 'readwrite', s => s.put(m, id)); }
}

/** Download a world as a file (gzip-compressed when the browser supports it). */
export async function downloadWorld(world: World): Promise<void> {
  const text = exportWorld(world);
  let blob: Blob = new Blob([text], { type: 'application/json' });
  let ext = 'json';
  if (typeof CompressionStream !== 'undefined') {
    blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
    ext = 'json.gz';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${world.name.replace(/[^\w-]+/g, '_')}_${world.season.year}.sws.${ext}`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function readWorldFile(file: File): Promise<World> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  let text: string;
  if (head[0] === 0x1f && head[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read compressed saves.');
    text = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  } else text = await file.text();
  return importWorld(text);
}
