// Projects and deadlines: tasks can belong to a project (a client or an initiative) and have a due date.
// The projects screen shows each project's progress, what is late, and a simple timeline of due dates.
import { el, button, uid, emit, clip } from './util.js';
import { S, byKey } from './state.js';
import { put, del } from './store.js';
import { openModal } from './modal.js';

export const PCOLORS = ['#4d7cff', '#2fe08a', '#ffc53d', '#ff5c8a', '#b06bff', '#22d3ee'];
S.projects = [];
export const projectById = id => S.projects.find(p => p.id === id);
const saveProject = p => put('projects', p.id, { ...p, at: Date.now() });

export function addProject(name, client = '') {
  const p = { id: uid('p'), name: clip(name.trim(), 40), client: clip(client.trim(), 40), color: PCOLORS[S.projects.length % PCOLORS.length], createdAt: Date.now() };
  S.projects.push(p); saveProject(p); emit('projects-changed');
  return p;
}
export function restoreProjects(docs) {
  S.projects = (docs || []).filter(d => typeof d.name === 'string').map(d => ({ id: d.id, name: d.name.slice(0, 40), client: String(d.client || '').slice(0, 40), color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : PCOLORS[0], createdAt: d.createdAt || 0 }))
    .sort((a, b) => a.createdAt - b.createdAt);
  emit('projects-changed');
}

/* ------------------------------------------------------------------ due dates */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const isOverdue = t => !!t.due && t.status !== 'done' && t.due < today();
export const isDueToday = t => !!t.due && t.status !== 'done' && t.due === today();
export function dueLabel(t) {
  if (!t.due) return '';
  const d = new Date(t.due + 'T00:00:00'), days = Math.round((d - new Date(today() + 'T00:00:00')) / 86400000);
  if (t.status === 'done') return '';
  if (days < 0) return `متأخرة ${-days === 1 ? 'يوماً' : -days + ' أيام'}`;
  if (days === 0) return 'تسليم اليوم';
  if (days === 1) return 'تسليم غداً';
  return `تسليم ${d.toLocaleDateString('ar', { day: 'numeric', month: 'short' })}`;
}

/** A project picker: a select (read its value by `id`) plus an inline field for a new project. */
export function projectSelect(id, value = '') {
  const wrap = el('div', 'psel');
  const s = el('select'); s.id = id;
  const fill = v => { s.replaceChildren(new Option('بدون مشروع', '')); S.projects.forEach(p => s.append(new Option(p.name + (p.client ? ` · ${p.client}` : ''), p.id))); s.append(new Option('+ مشروع جديد…', '__new')); s.value = v; };
  fill(value);
  const name = el('input'); name.maxLength = 40; name.placeholder = 'اسم المشروع الجديد'; name.id = id + '-new';
  const ok = button('btn', 'أضف', () => { if (!name.value.trim()) return name.focus(); const p = addProject(name.value); name.value = ''; extra.hidden = true; fill(p.id); });
  const extra = el('div', 'row'); extra.hidden = true; extra.append(name, ok);
  s.addEventListener('change', () => { extra.hidden = s.value !== '__new'; if (s.value === '__new') { s.value = ''; extra.hidden = false; name.focus(); } });
  wrap.append(s, extra);
  return wrap;
}

/* ------------------------------------------------------------------ projects screen */
export function openProjects() {
  const frag = document.createDocumentFragment();
  const body = el('div', 'projects');
  const draw = () => {
    body.replaceChildren();
    if (!S.projects.length) body.append(el('p', 'empty', 'لا مشاريع بعد. أنشئ مشروعاً ثم اختره عند إنشاء المهام.'));
    S.projects.forEach(p => body.append(projectCard(p, draw)));
    const loose = S.tasks.filter(t => !t.projectId && t.due && t.status !== 'done');
    if (loose.length) body.append(projectCard({ id: '', name: 'مهام بموعد بلا مشروع', color: '#94a3b8' }, draw, loose));
  };
  draw();
  const name = el('input'); name.id = 'proj-name'; name.maxLength = 40; name.placeholder = 'اسم المشروع';
  const client = el('input'); client.id = 'proj-client'; client.maxLength = 40; client.placeholder = 'العميل (اختياري)';
  const fl = (l, n) => { const x = el('label', 'field', l); x.append(n); return x; };
  const row = el('div', 'row'); row.append(fl('اسم المشروع', name), fl('العميل (اختياري)', client));
  const add = button('btn primary', 'أضف المشروع', () => { if (!name.value.trim()) return name.focus(); addProject(name.value, client.value); name.value = ''; client.value = ''; draw(); });
  frag.append(body, el('h4', '', 'مشروع جديد'), row);
  openModal('المشاريع والمواعيد', frag, [add]);
}
function projectCard(p, redraw, list = null) {
  const ts = list || S.tasks.filter(t => t.projectId === p.id);
  const done = ts.filter(t => t.status === 'done').length, late = ts.filter(isOverdue).length;
  const c = el('section', 'pcard'); c.style.setProperty('--c', p.color);
  const head = el('div', 'phead');
  head.append(el('i', 'sw'), el('b', '', p.name), el('small', 'muted', p.client || ''), el('span', 'pcount', `${done}/${ts.length}`));
  if (late) head.append(el('span', 'late', `${late} متأخرة`));
  c.append(head);
  const bar = el('div', 'bar'); bar.append(el('i')); bar.firstChild.style.width = (ts.length ? Math.round(done / ts.length * 100) : 0) + '%'; c.append(bar);
  // timeline: open tasks with a due date, ordered, on a strip from today to the latest date
  const dated = ts.filter(t => t.due && t.status !== 'done').sort((a, b) => a.due.localeCompare(b.due));
  if (dated.length) {
    const ul = el('ul', 'ptl');
    dated.slice(0, 12).forEach(t => {
      const li = el('li'); li.classList.toggle('late', isOverdue(t)); li.classList.toggle('today', isDueToday(t));
      li.append(el('time', '', new Date(t.due + 'T00:00:00').toLocaleDateString('ar', { weekday: 'short', day: 'numeric', month: 'short' })), el('span', '', clip(t.title, 60)), el('small', 'muted', byKey(t.chain[t.step])?.a.name || 'غير مسندة'));
      ul.append(li);
    });
    c.append(ul);
  } else if (ts.length) c.append(el('small', 'muted', 'لا مواعيد مفتوحة.'));
  if (p.id) {
    const rm = button('linkish', 'حذف المشروع', () => {
      if (!rm.dataset.sure) { rm.dataset.sure = '1'; rm.textContent = 'اضغط مرة أخرى: تبقى المهام بلا مشروع'; return; }
      S.projects = S.projects.filter(x => x !== p); del('projects', p.id);
      S.tasks.filter(t => t.projectId === p.id).forEach(t => { t.projectId = ''; put('tasks', t.id, t); });
      emit('projects-changed'); emit('tasks-changed'); redraw();
    });
    c.append(rm);
  }
  return c;
}
