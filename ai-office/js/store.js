// Saving: the artifact's database (private per user) when available, otherwise this browser's storage.
import { $ } from './util.js';

const store = { kind: 'none', db: null, base: '' };
const LS = 'deskhive:';
const lsGet = k => { try { return JSON.parse(localStorage.getItem(LS + k)); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch {} };
const withTimeout = (p, ms = 10000) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);

// collections and how many of the newest documents to load
export const COLS = { agents: 60, chats: 60, meetings: 12, tasks: 200, files: 200, events: 300, notes: 100, floors: 12, agentstate: 80, goals: 40, approvals: 80, replay: 24, memory: 80, prefs: 10, kb: 40, projects: 40, routines: 30 };

export function saveState(text, ok = true) {
  const s = $('save-state'); if (!s) return;
  s.textContent = text; s.classList.toggle('off', !ok);
}
export const storeKind = () => store.kind;

export async function initStore() {
  if (window.claude?.use) {
    try {
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      const id = user ? await user.id() : null;
      if (db && id) { store.kind = 'db'; store.db = db; store.base = `data/users/${id}`; }
    } catch {}
  }
  if (store.kind === 'none') { try { localStorage.setItem(LS + 'probe', '1'); store.kind = 'local'; } catch {} }
  return store.kind;
}

/** Older versions saved some collections as lists; read either shape as {id: doc}. */
function localMap(col) {
  const v = lsGet(col);
  if (!v) return {};
  if (Array.isArray(v)) return Object.fromEntries(v.filter(Boolean).map(d => [d.key || d.id, d]));
  if (col === 'chats') return Object.fromEntries(Object.entries(v).map(([k, t]) => [k, Array.isArray(t) ? { turns: t } : t]));
  return v;
}

/** Load every collection as arrays of {id, ...data}, newest first where it matters. */
export async function loadAll() {
  const out = {};
  if (store.kind === 'db') {
    await Promise.all(Object.keys(COLS).map(async col => {
      const snap = await withTimeout(store.db.collection(`${store.base}/${col}`).get());
      out[col] = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    }));
  } else if (store.kind === 'local') {
    for (const col of Object.keys(COLS)) out[col] = Object.entries(localMap(col)).map(([id, d]) => ({ ...d, id }));
  } else return null;
  for (const col of Object.keys(COLS)) {
    out[col] = (out[col] || []).sort((a, b) => (b.at || b.updatedAt || 0) - (a.at || a.updatedAt || 0)).slice(0, COLS[col]);
  }
  return out;
}

const queue = new Map(); // coalesce rapid writes to the same document
export function put(col, id, data) {
  const key = col + '/' + id;
  queue.set(key, { col, id, data });
  clearTimeout(put.t); put.t = setTimeout(flush, 250);
}
async function flush() {
  const items = [...queue.values()]; queue.clear();
  for (const { col, id, data } of items) await write(() => store.db.doc(`${store.base}/${col}/${id}`).set(data), () => {
    const m = localMap(col); m[id] = data;
    const keep = Object.entries(m).sort((a, b) => (b[1].at || b[1].updatedAt || 0) - (a[1].at || a[1].updatedAt || 0)).slice(0, COLS[col] || 200);
    lsSet(col, Object.fromEntries(keep));
  });
}
export function del(col, id) {
  queue.delete(col + '/' + id);
  return write(() => store.db.doc(`${store.base}/${col}/${id}`).delete(), () => { const m = localMap(col); delete m[id]; lsSet(col, m); });
}
async function write(fnDb, fnLocal) {
  try {
    if (store.kind === 'db') await fnDb();
    else if (store.kind === 'local') fnLocal();
    else return;
    saveState(store.kind === 'db' ? 'محفوظ في حسابك' : 'محفوظ في هذا المتصفح');
  } catch { saveState('تعذّر الحفظ', false); }
}

/** Everything you saved, as one JSON file (moves your office between claude.ai and the standalone site). */
export async function exportAll() {
  const data = await loadAll(); if (!data) return null;
  return { app: 'deskhive-office', version: 1, at: new Date().toISOString(), collections: data };
}
/** Write an exported file into this office's storage. Returns how many documents were written. */
export async function importAll(file) {
  if (file?.app !== 'deskhive-office' || typeof file.collections !== 'object') throw new Error('هذا ليس ملف تصدير من خلية المكتب.');
  let n = 0;
  for (const col of Object.keys(COLS)) {
    const docs = Array.isArray(file.collections[col]) ? file.collections[col] : [];
    for (const d of docs.slice(0, COLS[col])) {
      if (!d || typeof d.id !== 'string' || !d.id || d.id.includes('/')) continue;
      const data = { ...d };
      await write(() => store.db.doc(`${store.base}/${col}/${d.id}`).set(data), () => { const m = localMap(col); m[d.id] = data; lsSet(col, m); });
      n++;
    }
  }
  return n;
}
