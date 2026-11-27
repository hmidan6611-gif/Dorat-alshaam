// The agent side panel: overview (status, current task, tasks), chat, work log and files.
import { $, el, button, on, fmtTime } from './util.js';
import { S, isFemale } from './state.js';
import { STATUS } from './data.js';
import { statusText, atDesk, moodOf } from './agents.js';
import { floorById } from './floors.js';
import { renderChat, stopChat } from './chat.js';
import { openFile } from './modal.js';
import { openNewTask, currentKey } from './tasks.js';
import { openNewGoal, openGoal, goalProgress } from './goals.js';
import { holoPos, showHolo } from './holo.js';
import { openCallSetup } from './phone.js';
import { growthCard, renderMemory } from './growth.js';
import { usageCard } from './usage.js';
import { summarizeInbox } from './delivery.js';
import { focusOn } from './scene.js';

let tab = 'overview';
const label = id => STATUS.find(s => s.id === id)?.label || id;

export function openAgentPanel(ag, which = 'overview') {
  const a = ag.a;
  $('chat').style.setProperty('--c', a.color);
  $('chat-ava').style.setProperty('--c', a.color);
  $('chat-name').textContent = a.name;
  $('chat-role').textContent = `${a.role} · ${statusText(ag)}`;
  renderChat(ag);
  setTab(which);
}
export function closeAgentPanel() { stopChat(); }

on('open-tab', n => setTab(n));
function setTab(name) {
  tab = name;
  document.querySelectorAll('#ptabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  ['overview', 'chat', 'log', 'files', 'memory'].forEach(t => { $('pt-' + t).hidden = t !== name; });
  renderTab();
}
function renderTab() {
  const ag = S.focused; if (!ag) return;
  if (tab === 'overview') renderOverview(ag);
  if (tab === 'log') renderLog(ag);
  if (tab === 'files') renderFiles(ag);
  if (tab === 'memory') renderMemory(ag, $('agent-memory'));
}

function stateColor(ag) {
  if (ag.task) return '#3d6bff';
  if (!atDesk(ag)) return '#7dd3fc';
  return ag.a.working ? '#34e08a' : '#ffc53d';
}
function renderOverview(ag) {
  const a = ag.a, box = $('ov'); box.replaceChildren();
  const pill = el('span', 'statepill'); pill.style.setProperty('--sc', stateColor(ag)); pill.append(el('i'), document.createTextNode(statusText(ag)));
  box.append(pill);
  const meter = (label, pct, color, text) => {
    const m = el('div', 'meter'); m.style.setProperty('--mc', color);
    const bar = el('div', 'bar'); bar.append(el('i')); bar.firstChild.style.width = Math.round(pct) + '%';
    m.append(el('span', '', label), bar, el('span', 'muted', text)); return m;
  };
  const mood = moodOf(ag);
  box.append(meter('الطاقة', ag.energy, ag.energy < 30 ? '#ff6b6b' : ag.energy < 55 ? '#ffc53d' : '#34e08a', Math.round(ag.energy) + '%'),
    meter('المزاج', Math.min(100, ag.energy * 0.7 + 30 + ag.moodBoost), mood.color, mood.label));
  box.append(usageCard(ag), growthCard(ag));
  const fl = floorById(a.floorId); if (fl) box.append(el('div', 'muted', `${a.personality ? a.personality + ' · ' : ''}${fl.name}`));

  const mine = S.tasks.filter(t => t.chain.includes(a.key));
  const current = S.tasks.find(t => t.id === ag.task);
  const now = el('div', 'tlist'); const li = el('li');
  if (current) {
    li.append(el('small', '', 'يعمل الآن على'), button('linkish', current.title, () => openNewTaskOr(current)));
    const bar = el('div', 'bar'); bar.dataset.prog = current.id; bar.append(el('i')); bar.firstChild.style.width = Math.round((current.progress || 0) * 100) + '%';
    li.append(bar);
  } else li.append(el('small', '', isFemale(a) ? 'لا تعمل على مهمة الآن.' : 'لا يعمل على مهمة الآن.'));
  now.append(li); box.append(now);

  const filesN = S.files.filter(f => f.agentKey === a.key).length;
  const doneN = S.tasks.filter(t => t.status === 'done' && t.chain.includes(a.key)).length;
  const waitN = mine.filter(t => t.status === 'todo' && currentKey(t) === a.key).length;
  const kv = el('div', 'kv');
  [[doneN, 'مهام منجزة'], [filesN, 'ملفات'], [waitN, 'بالانتظار']].forEach(([n, l]) => { const d = el('div'); d.append(el('b', '', String(n)), el('span', '', l)); kv.append(d); });
  box.append(kv);

  box.append(el('p', 'lead', a.intro));
  const tools = el('div', 'row');
  tools.append(button('btn', 'مكالمة هاتفية', () => openCallSetup(ag)), button('btn', 'لخّص بريدي', () => summarizeInbox(ag)));
  tools.append(button('btn', isFemale(a) ? 'اقرأ شاشتها' : 'اقرأ شاشته', () => { showHolo(ag); focusOn(holoPos(ag), 2.6); }));
  box.append(tools);
  if (a.ceo) {
    const hd = el('div', 'row'); hd.style.alignItems = 'center';
    hd.append(el('h3', '', 'الأهداف'), button('btn gold', 'هدف جديد', openNewGoal)); hd.firstChild.style.flex = '1';
    box.append(hd);
    if (!S.goals.length) box.append(el('p', 'empty', 'أعطِ المدير هدفاً كبيراً، وسيقسّمه ويوزعه على الفريق ويسلّمك تقريراً نهائياً.'));
    else {
      const ul = el('ul', 'tlist');
      S.goals.slice(0, 8).forEach(g => { const li = el('li'); li.append(button('linkish', g.text, () => openGoal(g)), el('small', '', `${Math.round(goalProgress(g) * 100)}% · ${{ planning: 'يخطط', handing: 'يوزّع', running: 'الفريق يعمل', reporting: 'يكتب التقرير', review: 'بانتظار موافقتك', done: 'منجز', error: 'متوقف' }[g.status] || ''}`)); ul.append(li); });
      box.append(ul);
    }
  }
  const head = el('div', 'row'); head.style.alignItems = 'center';
  head.append(el('h3', '', isFemale(a) ? 'مهامها' : 'مهامه'), button('btn primary', '+ أسند مهمة', () => openNewTask(a.key)));
  head.firstChild.style.flex = '1';
  box.append(head);
  const open = mine.filter(t => t.status !== 'done');
  if (!open.length) box.append(el('p', 'empty', 'لا مهام مفتوحة. أسند مهمة من هنا، أو اسحب بطاقة من لوحة المهام إلى روبوته.'));
  else {
    const ul = el('ul', 'tlist');
    open.forEach(t => { const li = el('li'); li.append(el('b', '', t.title), el('small', '', `${label(t.status)}${t.paused ? ' · متوقفة' : ''}`)); ul.append(li); });
    box.append(ul);
  }
}
function openNewTaskOr(t) { const f = S.files.find(x => x.id === t.outputs[t.outputs.length - 1]); if (f) openFile(f); }

function renderLog(ag) {
  const box = $('agent-log'); box.replaceChildren();
  const list = S.events.filter(e => e.agentKey === ag.a.key).slice(0, 80);
  if (!list.length) { box.append(el('p', 'empty', 'لا يوجد سجل عمل بعد. سيظهر هنا كل ما يبدأه وينهيه ويسلّمه.')); return; }
  const ul = el('ul', 'timeline'); ul.style.setProperty('--c', ag.a.color);
  list.forEach(e => { const li = el('li'); li.append(el('time', '', fmtTime(e.at)), document.createTextNode(e.text)); ul.append(li); });
  box.append(ul);
}
function renderFiles(ag) {
  const box = $('agent-files'); box.replaceChildren();
  const list = S.files.filter(f => f.agentKey === ag.a.key);
  if (!list.length) { box.append(el('p', 'empty', 'لم ينتج ملفات بعد. كل مهمة ينجزها تتحول إلى ملف تجده هنا.')); return; }
  const ul = el('ul', 'tlist');
  list.forEach(f => { const li = el('li'); li.append(button('linkish', f.title, () => openFile(f)), el('small', '', fmtTime(f.at))); ul.append(li); });
  box.append(ul);
}

export function initPanel() {
  document.querySelectorAll('#ptabs button').forEach(b => { b.onclick = () => setTab(b.dataset.tab); });
  const refresh = () => { if (S.panel === 'chat' && S.focused) { $('chat-role').textContent = `${S.focused.a.role} · ${statusText(S.focused)}`; if (tab !== 'chat') renderTab(); } };
  ['agents-changed', 'tasks-changed', 'files-changed', 'events-changed', 'goals-changed', 'memory-changed', 'xp-changed', 'usage-changed'].forEach(n => on(n, refresh));
}
