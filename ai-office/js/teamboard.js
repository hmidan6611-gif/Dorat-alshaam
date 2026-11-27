// Shared team board (off by default). When you turn it on, the titles and progress of your tasks, never
// their content or files, are shared with colleagues who have this office open; you can see theirs too.
// Each person writes only their own document (team/<their id>); turning it off deletes yours.
import { $, el, on, fmtTime, clip } from './util.js';
import { S, byKey } from './state.js';
import { STATUS } from './data.js';

const PREF = 'deskhive:team-share';
let db = null, user = null, me = null, sharing = false, colleagues = [], unsub = null;
const names = new Map();
const getPref = () => { try { return localStorage.getItem(PREF) === '1'; } catch { return false; } };
const setPref = v => { try { localStorage.setItem(PREF, v ? '1' : '0'); } catch { /* private window */ } };
export const teamView = () => $('board-scope')?.value === 'team';

const compact = () => S.tasks.slice(0, 40).map(t => ({
  id: String(t.id).slice(0, 40), title: clip(t.title, 120), status: STATUS.some(s => s.id === t.status) ? t.status : 'todo',
  agents: t.chain.map(k => byKey(k)?.a.name || '').filter(Boolean).slice(0, 4), progress: Math.round((t.progress || 0) * 100), updatedAt: t.updatedAt || t.createdAt || 0,
}));
async function publishMine() {
  if (!db || !me || !sharing) return;
  try { await db.doc(`team/${me}`).set({ tasks: compact(), at: Date.now() }); setNote(''); }
  catch (e) { setNote(e?.code === 'quota_exceeded' ? 'امتلأت مساحة اللوحة المشتركة.' : 'تعذّرت المشاركة. قد لا تملك صلاحية التعديل على هذا المكتب (تحتاج صلاحية مساهم على الأقل).'); }
}
let t;
const schedulePublish = () => { clearTimeout(t); t = setTimeout(publishMine, 1500); };

function setNote(text) { const n = $('team-note'); if (n) { n.textContent = text; n.hidden = !text; } }
function renderToggle() {
  const b = $('team-share'); if (!b) return;
  b.hidden = !db; b.setAttribute('aria-pressed', String(sharing));
  b.textContent = sharing ? 'مشاركة مع الفريق: مفعّلة' : 'شارك لوحتي مع الفريق';
  const sel = $('board-scope'); if (sel) sel.hidden = !db;
}
async function setSharing(on) {
  sharing = on; setPref(on); renderToggle();
  if (!db || !me) return;
  if (on) publishMine();
  else { try { await db.doc(`team/${me}`).delete(); } catch { /* already gone */ } }
}

async function nameOf(id) {
  if (names.has(id)) return names.get(id);
  try { const ps = await user.profiles([id]); const n = ps?.[id]?.name || 'زميل'; names.set(id, n); return n; } catch { return 'زميل'; }
}
/** Read-only columns with everyone's shared tasks (yours included, marked). */
export function renderTeamBoard(cols) {
  cols.replaceChildren();
  const q = ($('board-q')?.value || '').trim().toLowerCase();
  const rows = colleagues.flatMap(c => c.tasks.map(x => ({ ...x, by: c.id }))).filter(x => !q || x.title.toLowerCase().includes(q));
  STATUS.forEach(s => {
    const list = rows.filter(x => x.status === s.id).sort((a, b) => b.updatedAt - a.updatedAt);
    const col = el('div', 'col'); const h = el('h3'); h.append(el('span', '', s.label), el('span', '', String(list.length))); col.append(h);
    if (!list.length && s.id === 'todo') col.append(el('p', 'empty', colleagues.length ? 'لا مهام هنا.' : 'لم يشارك أحد لوحته بعد. فعّل «شارك لوحتي مع الفريق» واطلب من زملائك ذلك.'));
    list.forEach(x => {
      const c = el('div', 'card team');
      const who = el('span', 'owner', x.by === me ? 'أنت' : names.get(x.by) || 'زميل');
      if (!names.has(x.by) && x.by !== me) nameOf(x.by).then(n => { who.textContent = n; });
      const top = el('div', 'top'); top.append(el('b', '', x.title)); c.append(top);
      const meta = el('div', 'muted'); meta.append(who, document.createTextNode(` · ${x.agents.join(' ← ') || 'غير مسندة'} · ${fmtTime(x.updatedAt)}`)); c.append(meta);
      if (x.status === 'doing') { const b = el('div', 'bar'); b.append(el('i')); b.firstChild.style.width = Math.max(0, Math.min(100, x.progress)) + '%'; c.append(b); }
      col.append(c);
    });
    cols.append(col);
  });
}

const clean = (id, d) => ({ id, tasks: (Array.isArray(d?.tasks) ? d.tasks : []).slice(0, 40).filter(x => x && typeof x.title === 'string').map(x => ({
  title: x.title.slice(0, 120), status: STATUS.some(s => s.id === x.status) ? x.status : 'todo',
  agents: Array.isArray(x.agents) ? x.agents.filter(a => typeof a === 'string').map(a => a.slice(0, 20)).slice(0, 4) : [],
  progress: typeof x.progress === 'number' ? x.progress : 0, updatedAt: typeof x.updatedAt === 'number' ? x.updatedAt : 0 })) });

export async function initTeamBoard(rerender) {
  const share = $('team-share'), scope = $('board-scope');
  share.onclick = () => setSharing(!sharing);
  scope.onchange = () => { document.body.classList.toggle('teamboard', teamView()); rerender(); };
  renderToggle();
  if (!window.claude?.use) return;
  try { [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]); me = user ? await user.id() : null; } catch { db = null; }
  if (!db || !me) { db = null; renderToggle(); return; }
  sharing = getPref(); renderToggle();
  if (sharing) publishMine();
  on('tasks-changed', () => { if (sharing) schedulePublish(); });
  try {
    unsub = db.collection('team').onSnapshot(snap => {
      colleagues = snap.docs.map(d => clean(d.id, d.data())).filter(c => c.tasks.length);
      if (teamView()) rerender();
    }, () => setNote('تعذّر تحميل لوحة الفريق.'));
  } catch { /* no live reads here */ }
}
export const stopTeamBoard = () => unsub?.();
