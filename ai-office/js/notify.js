// Notifications: toasts for finished work and approvals, plus a saved notification list behind the bell.
import { $, el, button, uid, fmtTime } from './util.js';
import { S, byKey } from './state.js';
import { put } from './store.js';
import { playChime } from './audio.js';

const actionsFor = new Map(); // kind -> (note) => [{label, cls, run}]
export const registerActions = (kind, fn) => actionsFor.set(kind, fn);

/** kind: 'done' | 'approve' | 'error' | 'info' */
export function notify({ text, kind = 'info', taskId = '', agentKey = '' }) {
  const n = { id: uid('n'), text, kind, taskId, agentKey, read: false, at: Date.now() };
  S.notes.unshift(n); S.notes.length = Math.min(S.notes.length, 100);
  put('notes', n.id, n);
  toast(n);
  if (kind === 'done' || kind === 'approve') playChime();
  renderNotes();
  return n;
}
function colorOf(n) { return byKey(n.agentKey)?.a.color || (n.kind === 'error' ? '#e5484d' : '#3d6bff'); }
function actionRow(n, after) {
  const acts = (actionsFor.get(n.kind) || (() => []))(n);
  if (!acts.length) return null;
  const row = el('div', 'acts');
  acts.forEach(a => row.append(button('btn ' + (a.cls || ''), a.label, () => { a.run(); markRead(n); after?.(); })));
  return row;
}
function toast(n) {
  const t = el('div', 'toast'); t.style.setProperty('--c', colorOf(n));
  const body = el('div'); body.append(el('div', '', n.text));
  const close = () => { t.remove(); };
  const row = actionRow(n, close); if (row) body.append(row);
  const x = button('iconbtn', '×', close); x.setAttribute('aria-label', 'إغلاق');
  t.append(body, x);
  $('toasts').prepend(t);
  while ($('toasts').children.length > 4) $('toasts').lastChild.remove();
  if (n.kind !== 'approve') setTimeout(close, 7000);
}
function markRead(n) { if (!n.read) { n.read = true; put('notes', n.id, n); renderNotes(); } }

export function renderNotes() {
  const unread = S.notes.filter(n => !n.read).length;
  const c = $('bell-count'); c.hidden = !unread; c.textContent = unread > 9 ? '9+' : unread;
  const ul = $('notes-list'); if (!ul) return;
  ul.replaceChildren();
  if (!S.notes.length) { ul.append(el('li', 'empty', 'لا توجد إشعارات بعد. ستصلك هنا عندما ينهي وكيل مهمة أو يحتاج موافقتك.')); return; }
  S.notes.slice(0, 60).forEach(n => {
    const li = el('li', n.read ? '' : 'unread'); li.style.setProperty('--c', colorOf(n));
    li.append(el('time', '', fmtTime(n.at)), el('div', '', n.text));
    const row = actionRow(n); if (row) li.append(row);
    ul.append(li);
  });
}
export function initNotes() {
  $('bell').onclick = () => { const p = $('notes'); p.hidden = !p.hidden; if (!p.hidden) renderNotes(); };
  $('notes-close').onclick = () => { $('notes').hidden = true; };
  $('notes-read').onclick = () => { S.notes.forEach(n => { if (!n.read) { n.read = true; put('notes', n.id, n); } }); renderNotes(); };
  renderNotes();
}
