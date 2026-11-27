// Entry point: builds the office, wires the top bar, team list, panels and picking, then restores saved work.
import { $, el, button, gsap, D, pick, rand, now, isPhone, on } from './util.js';
import { S, V } from './state.js';
import { BUILTIN, SLOTS, CORE_POS } from './data.js';
import { THREE, renderer, camera, coreBall, focusOn, runBuild, startLoop, ring3d, boost, sendPulse } from './scene.js';
import { makeStation, removeStation, goBreak, goHome, atDesk, onBreakCount, showBubble } from './agents.js';
import { initStore, loadAll, saveState, del } from './store.js';
import { initAI, updateMode } from './ai.js';
import { initVoice } from './voice.js';
import { initNotes, renderNotes } from './notify.js';
import { addLog, restoreLog } from './log.js';
import { initChat } from './chat.js';
import { initPanel, openAgentPanel, closeAgentPanel } from './panel.js';
import { initBoard, restoreTasks, schedule } from './tasks.js';
import { initMeeting, renderMeetHome } from './meeting.js';
import { initNewAgent, openNew, restoreAgents, freeSlot } from './newagent.js';

BUILTIN.forEach((b, s) => makeStation({ ...b, slot: s, custom: false, history: [] }));
const free = () => freeSlot(SLOTS.length);

/* --------------------------------------------------------------- panels, tabs, selection */
function showPanel(name) {
  if (S.panel === 'chat' && name !== 'chat') closeAgentPanel();
  ['chat', 'board', 'meet', 'new'].forEach(p => $(p).classList.toggle('open', p === name));
  S.panel = name;
  gsap.to(V, { shift: name ? 1 : 0, duration: D(1), ease: 'power3.inOut' });
}
function setTabState(name) {
  ['office', 'tasks', 'meet', 'output'].forEach(t => $('tab-' + t).setAttribute('aria-selected', String(t === name)));
  const out = name === 'output';
  $('team').hidden = out; $('log').hidden = !out; $('team-title').textContent = out ? 'آخر المخرجات' : 'فريقك';
}
function select(ag) {
  if (ag && S.meeting.running) return;
  S.agents.forEach(o => gsap.to(o, { selA: o === ag ? 1 : 0, duration: D(0.5) }));
  S.focused = ag;
  if (ag) {
    setTabState('office');
    goHome(ag, true);
    const p = ag.g.position;
    focusOn(new THREE.Vector3(p.x, 1.2, p.z - 0.5), isPhone() ? 1.9 : 1.6);
    showPanel('chat'); openAgentPanel(ag);
    ring3d(ag.ring, ag.a.color, 2.6, 1, 0.4); boost(ag, 1, 1.2);
  } else {
    focusOn(new THREE.Vector3(0, 0.5, 0), 1);
    if (S.panel === 'chat') showPanel(null);
  }
  refreshTeam();
}
function setTab(name) {
  if (S.meeting.running && name !== 'meet') return;
  setTabState(name);
  if (name === 'office') { select(null); showPanel(null); }
  if (name === 'output') { select(null); }
  if (name === 'tasks') { select(null); showPanel('board'); focusOn(new THREE.Vector3(0, 0.5, 0), isPhone() ? 0.9 : 0.95); }
  if (name === 'meet') { select(null); showPanel('meet'); if (!S.meeting.running) renderMeetHome(); focusOn(new THREE.Vector3(0.8, 0.5, 0), isPhone() ? 0.95 : 1); }
}
const focusHive = () => { select(null); showPanel(null); setTabState('office'); focusOn(CORE_POS, isPhone() ? 1.25 : 1.5); };
$('tab-office').onclick = () => setTab('office');
$('tab-tasks').onclick = () => setTab('tasks');
$('tab-meet').onclick = () => setTab('meet');
$('tab-output').onclick = () => setTab('output');
$('replay').onclick = () => { if (!S.meeting.running) { select(null); runBuild(); } };
$('chat-close').onclick = () => select(null);
$('board-close').onclick = () => setTab('office');

/* --------------------------------------------------------------- team list (also a drop target for tasks) */
function renderTeam() {
  const ul = $('team'); ul.replaceChildren();
  S.agents.forEach(ag => {
    const a = ag.a, li = el('li'), b = el('button', 'member');
    b.type = 'button'; b.dataset.key = a.key;
    b.style.setProperty('--c', a.color); b.setAttribute('aria-pressed', 'false');
    const ava = el('span', 'ava'); ava.append(el('i'));
    const who = el('span', 'who'); who.append(el('b', '', a.name), el('span', '', a.role));
    b.append(ava, who, el('span', 'badge'));
    b.onclick = () => select(S.focused === ag ? null : ag);
    ag.memberBtn = b; li.append(b); ul.append(li);
  });
  const li = el('li'), add = button('member add', '+ وكيل جديد', openNew);
  add.id = 'add-agent'; li.append(add); ul.append(li);
  refreshTeam();
}
function refreshTeam() {
  S.agents.forEach(ag => {
    const b = ag.memberBtn; if (!b) return;
    b.setAttribute('aria-pressed', String(ag === S.focused));
    const badge = b.querySelector('.badge'), brk = !atDesk(ag) && !ag.task;
    badge.textContent = ag.task ? 'مهمة' : brk ? 'استراحة' : ag.a.working ? 'يعمل' : 'خامل';
    badge.classList.toggle('idle', !ag.a.working && !brk && !ag.task); badge.classList.toggle('brk', brk || !!ag.task);
  });
  $('st-working').textContent = S.agents.filter(o => (o.a.working || o.task) && atDesk(o)).length;
  const add = $('add-agent');
  if (add) { const full = free() < 0; add.disabled = full; add.textContent = full ? 'المكتب ممتلئ' : '+ وكيل جديد'; }
}
on('agents-changed', refreshTeam);
on('team-changed', renderTeam);
on('stats', () => { $('st-tasks').textContent = S.tasksDoneToday; });
on('meeting-ended', () => schedule());
on('ai-changed', () => { if (S.panel === 'meet' && !S.meeting.running) renderMeetHome(); });
setInterval(() => { $('st-clock').textContent = new Date().toTimeString().slice(0, 5); }, 1000);

function deleteAgent(ag) {
  const a = ag.a;
  select(null); removeStation(ag);
  del('agents', a.key); del('chats', a.key);
  renderTeam();
}

/* --------------------------------------------------------------- picking robots in the scene */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
  if (S.meeting.running) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (ray.intersectObject(coreBall).length) { focusHive(); return; }
  const ag = ray.intersectObjects(S.hitMeshes)[0]?.object.userData.ag || null;
  if (ag) select(ag === S.focused ? null : ag);
  else if (S.panel === 'chat') select(null);
});
renderer.domElement.addEventListener('pointermove', e => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  renderer.domElement.style.cursor = ray.intersectObjects(S.hitMeshes).length || ray.intersectObject(coreBall).length ? 'pointer' : 'grab';
});

/* --------------------------------------------------------------- ambient office life */
function taskTick() {
  if (S.built && !S.meeting.running) {
    const working = S.agents.filter(o => o.a.working && atDesk(o) && !o.task);
    if (working.length) {
      const o = pick(working), t = pick(o.a.tasks);
      showBubble(o, t); sendPulse(o);
      S.tasksDoneToday++; $('st-tasks').textContent = S.tasksDoneToday; addLog(o, t);
      if (now() > o.mv.workUntil && onBreakCount() < 3 && S.focused !== o && Math.random() < 0.6) setTimeout(() => goBreak(o), 3300);
    }
    const idle = S.agents.filter(o => !o.a.working && atDesk(o) && !o.task && S.focused !== o);
    if (idle.length && onBreakCount() < 3 && Math.random() < 0.25) goBreak(pick(idle));
  }
  setTimeout(taskTick, rand(2200, 4200));
}

/* --------------------------------------------------------------- restore saved work */
async function restore() {
  const kind = await initStore();
  if (kind === 'none') { saveState('بدون حفظ', false); return; }
  let data;
  try { data = await loadAll(); } catch { saveState('تعذّر التحميل', false); return; }
  if (!data) return;
  restoreAgents(data.agents, SLOTS.length);
  for (const c of data.chats) {
    const ag = S.agents.find(o => o.a.key === c.id);
    const turns = Array.isArray(c.turns) ? c.turns : [];
    if (ag) ag.a.history = turns.filter(t => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content);
  }
  S.meetings = data.meetings.filter(m => typeof m.topic === 'string' && Array.isArray(m.lines));
  S.tasks = data.tasks.filter(t => typeof t.title === 'string');
  S.files = data.files.filter(f => typeof f.content === 'string');
  S.events = data.events.filter(e => typeof e.text === 'string');
  S.notes = data.notes.filter(n => typeof n.text === 'string');
  restoreTasks(); restoreLog(); renderNotes(); renderTeam();
  if (S.focused) openAgentPanel(S.focused);
  if (S.panel === 'meet' && !S.meeting.running) renderMeetHome();
  saveState(kind === 'db' ? 'محفوظ في حسابك' : 'محفوظ في هذا المتصفح');
}

/* --------------------------------------------------------------- start */
initAI(); updateMode();
initVoice();
initNotes();
initChat({ onDeleteAgent: deleteAgent });
initPanel();
initBoard();
initMeeting({ setTab, setTabState });
initNewAgent({ select, setTabState, showPanel, freeSlot: free, focusLounge: () => focusOn(new THREE.Vector3(3, 0.5, 0), isPhone() ? 0.95 : 1) });
renderTeam();
restore();
runBuild();
setTimeout(taskTick, 3500);
startLoop();
