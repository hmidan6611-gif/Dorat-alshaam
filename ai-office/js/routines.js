// Recurring tasks: "every Sunday at 9, a weekly report by Juno". The office has no server, so a routine runs
// when the office is open at or after its time: one task per period, never a pile of missed ones.
import { el, button, uid, emit, on, clip } from './util.js';
import { S, byKey } from './state.js';
import { put, del } from './store.js';
import { openModal } from './modal.js';
import { addEvent } from './log.js';
import { projectSelect } from './projects.js';

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
S.routines = [];
let createTask = null;
const save = r => put('routines', r.id, { ...r, at: Date.now() });
const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The latest moment this routine was due (at or before now). */
function lastDue(r, now = new Date()) {
  const d = new Date(now); d.setHours(r.hour, 0, 0, 0);
  if (r.every === 'daily') { if (d > now) d.setDate(d.getDate() - 1); }
  else if (r.every === 'weekly') { let back = (d.getDay() - r.dow + 7) % 7; d.setDate(d.getDate() - back); if (d > now) d.setDate(d.getDate() - 7); }
  else { d.setDate(r.dom); if (d > now) { d.setMonth(d.getMonth() - 1); d.setDate(r.dom); } }
  return d;
}
export const describe = r => `${r.every === 'daily' ? 'يومياً' : r.every === 'weekly' ? `كل ${DAYS[r.dow]}` : `يوم ${r.dom} من كل شهر`} الساعة ${pad(r.hour)}:00`;

/** Create the tasks that are due now. */
export function runDue() {
  if (!createTask) return;
  for (const r of S.routines) {
    if (!r.enabled) continue;
    const due = lastDue(r), key = dayKey(due);
    if (r.lastRun === key || r.createdAt > due.getTime()) continue;
    const chain = r.chain.filter(byKey);
    const t = createTask({ title: `${r.title} · ${due.toLocaleDateString('ar', { day: 'numeric', month: 'short' })}`, desc: r.desc, chain, approval: r.approval !== false, projectId: r.projectId || '', routineId: r.id, qa: !!r.qa });
    r.lastRun = key; save(r);
    const ag = byKey(chain[0]); if (ag) addEvent(ag, `مهمة متكررة: «${clip(t.title, 60)}»`, t.id);
  }
}
export function restoreRoutines(docs) {
  S.routines = (docs || []).filter(d => typeof d.title === 'string' && Array.isArray(d.chain)).map(d => ({
    id: d.id, title: d.title.slice(0, 100), desc: String(d.desc || '').slice(0, 1500), chain: d.chain.filter(k => typeof k === 'string').slice(0, 3),
    every: ['daily', 'weekly', 'monthly'].includes(d.every) ? d.every : 'weekly', dow: Math.max(0, Math.min(6, d.dow | 0)), dom: Math.max(1, Math.min(28, d.dom | 0 || 1)),
    hour: Math.max(0, Math.min(23, d.hour | 0)), projectId: String(d.projectId || ''), approval: d.approval !== false, qa: !!d.qa,
    enabled: d.enabled !== false, lastRun: String(d.lastRun || ''), createdAt: d.createdAt || 0 }));
}
export function initRoutines(hooks) {
  createTask = hooks.createTask;
  setTimeout(runDue, 6000);
  setInterval(runDue, 5 * 60000);
  on('visible', runDue);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) runDue(); });
}

/* ------------------------------------------------------------------ screen */
export function openRoutines() {
  const frag = document.createDocumentFragment();
  frag.append(el('p', 'lead', 'مهام تتكرر تلقائياً. تُنشأ عند فتح المكتب في موعدها أو بعده، مهمة واحدة لكل موعد حتى لو غبت أياماً.'));
  const list = el('ul', 'tlist');
  const draw = () => {
    list.replaceChildren();
    if (!S.routines.length) list.append(el('li', 'empty', 'لا مهام متكررة بعد.'));
    S.routines.forEach(r => {
      const li = el('li'); li.classList.toggle('off', !r.enabled);
      li.append(el('b', '', r.title), el('small', 'muted', `${describe(r)} · ${r.chain.map(k => byKey(k)?.a.name || '؟').join(' ← ')}`));
      const row = el('div', 'row');
      row.append(button('btn', r.enabled ? 'إيقاف مؤقت' : 'تشغيل', () => { r.enabled = !r.enabled; save(r); draw(); }),
        button('btn', 'شغّلها الآن', () => { r.lastRun = ''; r.createdAt = 0; save(r); runDue(); draw(); }),
        button('btn danger', 'حذف', () => { S.routines = S.routines.filter(x => x !== r); del('routines', r.id); draw(); }));
      li.append(row); list.append(li);
    });
  };
  draw();
  const title = el('input'); title.id = 'rt-title'; title.maxLength = 100; title.placeholder = 'مثلاً: تقرير المبيعات الأسبوعي';
  const desc = el('textarea'); desc.id = 'rt-desc'; desc.rows = 2; desc.maxLength = 1500; desc.placeholder = 'ماذا يسلّم كل مرة؟';
  const who = el('select'); who.id = 'rt-who'; S.agents.forEach(o => who.append(new Option(`${o.a.name} — ${o.a.role}`, o.a.key)));
  const every = el('select'); every.id = 'rt-every'; [['daily', 'يومياً'], ['weekly', 'أسبوعياً'], ['monthly', 'شهرياً']].forEach(([v, l]) => every.append(new Option(l, v))); every.value = 'weekly';
  const dow = el('select'); dow.id = 'rt-dow'; DAYS.forEach((d, i) => dow.append(new Option(d, i)));
  const dom = el('input'); dom.type = 'number'; dom.min = 1; dom.max = 28; dom.value = 1; dom.id = 'rt-dom';
  const hour = el('select'); hour.id = 'rt-hour'; for (let h = 0; h < 24; h++) hour.append(new Option(`${pad(h)}:00`, h)); hour.value = 9;
  const proj = projectSelect('rt-project');
  const f = (l, n) => { const x = el('label', 'field', l); x.append(n); return x; };
  const dowF = f('اليوم', dow), domF = f('يوم الشهر', dom); domF.hidden = true;
  every.onchange = () => { dowF.hidden = every.value !== 'weekly'; domF.hidden = every.value !== 'monthly'; };
  const when = el('div', 'row'); when.append(f('التكرار', every), dowF, domF, f('الساعة', hour));
  frag.append(list, el('h4', '', 'مهمة متكررة جديدة'), f('العنوان', title), f('التفاصيل', desc), f('المسؤول', who), when, f('المشروع', proj));
  const add = button('btn primary', 'أضف المهمة المتكررة', () => {
    if (!title.value.trim()) return title.focus();
    if (!who.value) return;
    const r = { id: uid('rt'), title: title.value.trim().slice(0, 100), desc: desc.value.trim(), chain: [who.value], every: every.value, dow: +dow.value, dom: Math.max(1, Math.min(28, +dom.value || 1)),
      hour: +hour.value, projectId: document.getElementById('rt-project').value.replace('__new', ''), approval: true, qa: false, enabled: true, lastRun: '', createdAt: Date.now() };
    S.routines.push(r); save(r); title.value = ''; desc.value = ''; draw(); emit('routines-changed');
  });
  openModal('المهام المتكررة', frag, [add]);
}
