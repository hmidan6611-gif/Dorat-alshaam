// Approvals box: sensitive actions (sending email, saving to Drive, publishing, paying, phone calls) wait here
// and run only after you approve them. Nothing is sent on its own.
import { $, el, button, uid, emit, on, fmtTime, clip } from './util.js';
import { S, byKey } from './state.js';
import { put } from './store.js';
import { notify, registerActions } from './notify.js';
import { openModal } from './modal.js';
import { addEvent } from './log.js';
import { mcpErrText } from './integrations.js';

export const KINDS = {
  email: { label: 'إرسال بريد', color: '#4d7cff' },
  drive: { label: 'حفظ في Google Drive', color: '#2fe08a' },
  call: { label: 'مكالمة هاتفية', color: '#ff8a3d' },
  publish: { label: 'نشر', color: '#b06bff' },
  payment: { label: 'دفع', color: '#ff5c8a' },
};
const executors = {}; // kind -> async (item) => result text
export const registerExecutor = (kind, fn) => { executors[kind] = fn; };
const save = a => { a.updatedAt = Date.now(); put('approvals', a.id, a); emit('approvals-changed', a); };
export const pending = () => S.approvals.filter(a => a.status === 'pending');

/** An agent asks to do something sensitive. preview: what you will see before approving. */
export function requestApproval({ kind, agentKey, title, preview, payload }) {
  const a = { id: uid('ap'), kind, agentKey, title, preview, payload, status: 'pending', result: '', at: Date.now() };
  S.approvals.unshift(a); save(a);
  const ag = byKey(agentKey);
  if (ag) addEvent(ag, `طلب موافقتك على ${KINDS[kind]?.label || kind}: ${clip(title, 60)}`);
  notify({ text: `${ag?.a.name || 'وكيل'} يطلب موافقتك على ${KINDS[kind]?.label || kind}: ${clip(title, 70)}`, kind: 'action', taskId: a.id, agentKey });
  return a;
}
export async function decide(a, ok) {
  if (a.status !== 'pending') return;
  const ag = byKey(a.agentKey);
  if (!ok) { a.status = 'rejected'; save(a); if (ag) addEvent(ag, `رفضت: ${clip(a.title, 60)}`); return; }
  const run = executors[a.kind];
  if (!run) { a.status = 'failed'; a.result = 'هذا النوع غير مربوط بخدمة حقيقية بعد، فلم يُنفَّذ شيء.'; save(a); return; }
  a.status = 'running'; save(a);
  try {
    a.result = String(await run(a) || 'تم'); a.status = 'done';
    if (ag) addEvent(ag, `نُفّذ بعد موافقتك: ${clip(a.title, 60)}`);
  } catch (e) {
    a.status = 'failed'; a.result = mcpErrText(e);
    if (ag) addEvent(ag, `تعذّر تنفيذ «${clip(a.title, 50)}»: ${a.result}`);
  }
  save(a);
}
registerActions('action', n => {
  const a = S.approvals.find(x => x.id === n.taskId); if (!a || a.status !== 'pending') return [];
  return [{ label: 'مراجعة', cls: 'primary', run: () => openApproval(a) }];
});

export function openApproval(a) {
  const frag = document.createDocumentFragment();
  const ag = byKey(a.agentKey);
  frag.append(el('div', 'muted', `${KINDS[a.kind]?.label || a.kind} · ${ag?.a.name || ''} · ${fmtTime(a.at)}`));
  frag.append(el('div', 'doc', a.preview || ''));
  if (a.result) frag.append(el('p', 'lead', a.result));
  let close;
  const footer = a.status === 'pending'
    ? [button('btn primary', 'موافقة وتنفيذ', async () => { close(); await decide(a, true); openApproval(a); }), button('btn danger', 'رفض', () => { decide(a, false); close(); })]
    : [];
  close = openModal(a.title, frag, footer);
}
const STATUS = { pending: 'بانتظار موافقتك', running: 'يُنفَّذ الآن', done: 'تم', rejected: 'مرفوض', failed: 'تعذّر' };
export function openInbox() {
  const frag = document.createDocumentFragment();
  frag.append(el('p', 'lead', 'كل إجراء حساس يطلبه وكيل ينتظر هنا. لا يُرسل بريد ولا تُحفظ ملفات ولا تُجرى مكالمات إلا بعد موافقتك.'));
  const ul = el('ul', 'tlist');
  if (!S.approvals.length) ul.append(el('li', 'empty', 'لا توجد طلبات بعد.'));
  S.approvals.slice(0, 40).forEach(a => {
    const li = el('li'); li.style.borderInlineStart = `3px solid ${KINDS[a.kind]?.color || '#94a3b8'}`;
    li.append(button('linkish', a.title, () => { close(); openApproval(a); }), el('small', '', `${KINDS[a.kind]?.label || a.kind} · ${byKey(a.agentKey)?.a.name || ''} · ${STATUS[a.status] || a.status}`));
    ul.append(li);
  });
  frag.append(ul);
  const close = openModal('صندوق الموافقات', frag);
}
export function renderApprovalBadge() {
  const n = pending().length, c = $('inbox-count');
  if (c) { c.hidden = !n; c.textContent = n > 9 ? '9+' : n; }
  emit('approvals-count', n);
}
export function restoreApprovals() {
  S.approvals.forEach(a => { if (a.status === 'running') { a.status = 'failed'; a.result = 'انقطع التنفيذ بسبب تحديث الصفحة. تحقق من الخدمة قبل إعادة الطلب.'; } });
  renderApprovalBadge();
}
export function initApprovals() {
  $('inbox-btn').onclick = openInbox;
  on('approvals-changed', renderApprovalBadge);
  renderApprovalBadge();
}
