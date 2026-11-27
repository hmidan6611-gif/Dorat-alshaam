// Entry point: builds the floors and agents, wires the top bar, team list, panels and picking, then restores saved work.
import { $, el, button, gsap, D, pick, rand, now, isPhone, on, emit } from './util.js';
import { S, V, byKey } from './state.js';
import { BUILTIN, CEO } from './data.js';
import { THREE, renderer, camera, coreBall, corePos, focusOn, runBuild, startLoop, ring3d, boost, sendPulse, shown } from './scene.js';
import { makeAgent, removeAgent, bindOffice, goBreak, goHome, atDesk, onBreakCount, showBubble, saveAgentState } from './agents.js';
import { buildFloor, setView, floorById, drawObj, undrawObj, saveFloor, findOfficeSpot, FL, expandFloor } from './floors.js';
import { roomCenter, defaultLights } from './layout.js';
import { initGoals, restoreGoals, openNewGoal } from './goals.js';
import { initApprovals, restoreApprovals } from './approvals.js';
import { initReplay, restoreReplay } from './replay.js';
import { initGrowth, restoreMemory, restoreXp } from './growth.js';
import { initReception } from './reception.js';
import { restoreUsage } from './usage.js';
import { openServices } from './delivery.js';
import './workspace.js';
import { initMultiuser, openInvite } from './multiuser.js';
import { openStore } from './templates.js';
import { restoreKnowledge, openKnowledge, nudgeProfile } from './knowledge.js';
import { exportAll, importAll } from './store.js';
import { restoreProjects, openProjects } from './projects.js';
import { maybeBrief } from './brief.js';
import { initThemes } from './themes.js';
import { restoreRoutines, openRoutines, initRoutines } from './routines.js';
import { openPlans, restorePlan } from './plans.js';
import { initIntegrations } from './integrations.js';
import './phone.js';
import { defaultMainObjects, footprint } from './layout.js';
import { rebuildNav } from './nav.js';
import { initStore, loadAll, saveState, del } from './store.js';
import { initAI, updateMode } from './ai.js';
import { initVoice } from './voice.js';
import { initNotes, renderNotes, notify } from './notify.js';
import { addLog, restoreLog } from './log.js';
import { initChat } from './chat.js';
import { initPanel, openAgentPanel, closeAgentPanel } from './panel.js';
import { initBoard, restoreTasks, schedule, createTask } from './tasks.js';
import { initMeeting, renderMeetHome } from './meeting.js';
import { initNewAgent, openNew, restoreAgents, hasRoom } from './newagent.js';
import { initDayCycle } from './daycycle.js';
import { initFloorsUI, renderFloorsUI } from './floorsui.js';
import { initEditor, setEditing } from './editor.js';
import { initDashboard, openDashboard } from './dashboard.js';
import { initManager } from './manager.js';
import { initQuality } from './quality.js';
import { initSettings } from './settings.js';

/* --------------------------------------------------------------- the office */
S.floors = [{ id: 'main', name: 'المكتب الرئيسي', dept: 'الإدارة', color: '#3d6bff', order: 0, lit: true, objects: defaultMainObjects() }];
S.viewFloor = 'main';
buildFloor(S.floors[0]);
[...BUILTIN, CEO].forEach(b => makeAgent({ ...b, custom: false, history: [], floorId: 'main', officeId: 'o_' + b.key }));

/* --------------------------------------------------------------- panels, tabs, selection */
function showPanel(name) {
  if (S.panel === 'chat' && name !== 'chat') closeAgentPanel();
  ['chat', 'board', 'meet', 'new'].forEach(p => $(p).classList.toggle('open', p === name));
  S.panel = name;
  gsap.to(V, { shift: name ? 1 : 0, duration: D(1), ease: 'power3.inOut' });
}
function setTabState(name) {
  ['office', 'tasks', 'meet', 'dash'].forEach(t => $('tab-' + t)?.setAttribute('aria-selected', String(t === name)));
  openDashboard(name === 'dash');
}
/** Frame the whole viewed floor (an expanded 20 m floor is framed a little wider). */
export function focusRoom(zoom = 1) {
  const f = floorById(S.viewFloor), c = roomCenter(f);
  focusOn(new THREE.Vector3(c, 0.5, c), f?.size === 20 ? zoom * 0.8 : zoom);
}
export function viewFloor(id) {
  if (S.viewFloor === id) return;
  setView(id); renderFloorsUI(); renderTeam();
  focusRoom(1);
}
function select(ag) {
  if (ag && S.meeting.running) return;
  S.agents.forEach(o => gsap.to(o, { selA: o === ag ? 1 : 0, duration: D(0.5) }));
  S.focused = ag;
  if (ag) {
    if (ag.a.floorId !== S.viewFloor) viewFloor(ag.a.floorId);
    setTabState('office');
    goHome(ag, true);
    focusOn(new THREE.Vector3(ag.seat.x, 1.2, ag.seat.z), isPhone() ? 1.9 : 1.6);
    showPanel('chat'); openAgentPanel(ag);
    ring3d(ag.parts.ring, ag.a.color, 2.6, 1, 0.4); boost(ag, 1, 1.2);
  } else {
    focusRoom(1);
    if (S.panel === 'chat') showPanel(null);
  }
  refreshTeam();
}
function setTab(name) {
  if (S.meeting.running && name !== 'meet') return;
  if (S.editing) setEditing(false);
  setTabState(name);
  if (name === 'office') { select(null); showPanel(null); }
  if (name === 'dash') { select(null); showPanel(null); }
  if (name === 'tasks') { select(null); showPanel('board'); focusRoom(isPhone() ? 0.9 : 0.95); }
  if (name === 'meet') {
    select(null); if (S.viewFloor !== 'main') viewFloor('main');
    showPanel('meet'); if (!S.meeting.running) renderMeetHome(); focusOn(new THREE.Vector3(0.8, 0.5, 2), isPhone() ? 0.95 : 1);
  }
}
const focusHive = () => { select(null); showPanel(null); setTabState('office'); focusOn(corePos, isPhone() ? 1.25 : 1.5); };
$('tab-office').onclick = () => setTab('office');
$('tab-tasks').onclick = () => setTab('tasks');
$('tab-meet').onclick = () => setTab('meet');
$('tab-dash').onclick = () => setTab('dash');

$('chat-close').onclick = () => select(null);
$('board-close').onclick = () => setTab('office');

/* --------------------------------------------------------------- team list (also a drop target for tasks) */
function renderTeam() {
  const ul = $('team'); ul.replaceChildren();
  const here = S.agents.filter(o => o.a.floorId === S.viewFloor), away = S.agents.filter(o => o.a.floorId !== S.viewFloor);
  [...here, ...away].forEach(ag => {
    const a = ag.a, li = el('li'), b = el('button', 'member');
    li.hidden = !matches(ag);
    b.type = 'button'; b.dataset.key = a.key;
    b.style.setProperty('--c', a.color); b.setAttribute('aria-pressed', 'false');
    if (a.floorId !== S.viewFloor) b.style.opacity = '0.6';
    const ava = el('span', 'ava'); ava.append(el('i'));
    const who = el('span', 'who'); who.append(el('b', '', a.name), el('span', '', a.floorId === S.viewFloor ? a.role : `${a.role} · ${floorById(a.floorId)?.name || ''}`));
    b.append(ava, who, el('span', 'badge'));
    b.onclick = () => select(S.focused === ag ? null : ag);
    ag.memberBtn = b; li.append(b); ul.append(li);
  });
  const li = el('li'), add = button('member add', '+ وكيل جديد', openNew);
  add.id = 'add-agent'; li.append(add); ul.append(li);
  const li2 = el('li'), store = button('member add', 'متجر الوكلاء', openStore); store.id = 'open-store'; li2.append(store); ul.append(li2);
  refreshTeam();
}
/* search: filters the team list and dims robots that don't match */
const norm = s => (s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
function matches(ag) {
  const q = norm(S.search); if (!q) return true;
  const hay = norm([ag.a.name, ag.a.role, ag.a.personality, floorById(ag.a.floorId)?.name, ag.memberBtn?.querySelector('.badge')?.textContent].join(' '));
  return q.split(/\s+/).every(w => hay.includes(w));
}
$('team-search').addEventListener('input', e => {
  S.search = e.target.value.trim();
  S.agents.forEach(ag => { if (ag.memberBtn) ag.memberBtn.parentElement.hidden = !matches(ag); ag.dim = !!S.search && !matches(ag); });
});
function refreshTeam() {
  S.agents.forEach(ag => {
    const b = ag.memberBtn; if (!b) return;
    b.setAttribute('aria-pressed', String(ag === S.focused));
    const badge = b.querySelector('.badge'), brk = !atDesk(ag) && !ag.task;
    badge.textContent = ag.task ? 'مهمة' : brk ? 'استراحة' : ag.a.working ? 'يعمل' : 'خامل';
    badge.classList.toggle('idle', !ag.a.working && !brk && !ag.task); badge.classList.toggle('brk', brk || !!ag.task);
  });
  $('st-working').textContent = S.agents.filter(o => (o.a.working || o.task) && atDesk(o)).length;
}
on('agents-changed', refreshTeam);
on('select-agent', ag => { if (S.focused !== ag) select(ag); });
on('team-changed', () => { renderTeam(); renderFloorsUI(); });
on('stats', () => { $('st-tasks').textContent = S.tasksDoneToday; });
on('meeting-ended', () => schedule());
on('ai-changed', () => { if (S.panel === 'meet' && !S.meeting.running) renderMeetHome(); });

function deleteAgent(ag) {
  const a = ag.a, floor = floorById(a.floorId), o = floor?.objects.find(x => x.id === a.officeId);
  select(null); removeAgent(ag);
  if (o) { o.agentKey = null; undrawObj(o.id); drawObj(floor, o); saveFloor(floor); }
  del('agents', a.key); del('chats', a.key); del('agentstate', a.key);
  renderTeam();
}

/* --------------------------------------------------------------- picking robots in the scene */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const visibleHits = () => S.hitMeshes.filter(h => shown(h.parent));
let down = null, pendingClick = 0;
renderer.domElement.addEventListener('dblclick', () => clearTimeout(pendingClick));
export const pickAgent = (x, y) => {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  // the robot itself wins over the office box it happens to stand in
  const bots = S.agents.filter(o => o.curFloor === S.viewFloor);
  const hit = ray.intersectObjects(bots.map(o => o.robot), true)[0];
  if (hit) { let g = hit.object; while (g && !bots.some(o => o.robot === g)) g = g.parent; const ag = bots.find(o => o.robot === g); if (ag) return ag; }
  return ray.intersectObjects(visibleHits())[0]?.object.userData.ag || null;
};
renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
  if (S.meeting.running || S.editing) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (coreBall.parent.visible && ray.intersectObject(coreBall).length) { focusHive(); return; }
  const ag = pickAgent(e.clientX, e.clientY);
  const act = () => { if (ag) select(ag === S.focused ? null : ag); else if (S.panel === 'chat') select(null); };
  // in manager mode wait a moment: a second click means "follow", not "open the panel"
  if (S.manager) { clearTimeout(pendingClick); pendingClick = setTimeout(act, 320); return; }
  act();
});
renderer.domElement.addEventListener('pointermove', e => {
  if (S.editing) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  renderer.domElement.style.cursor = ray.intersectObjects(visibleHits()).length ? 'pointer' : 'grab';
});

/* --------------------------------------------------------------- ambient office life */
function taskTick() {
  if (S.built && !S.meeting.running) {
    const working = S.agents.filter(o => o.a.working && atDesk(o) && !o.task);
    if (working.length) {
      const o = pick(working), t = pick(o.a.tasks);
      showBubble(o, t); sendPulse(o);
      S.tasksDoneToday++; $('st-tasks').textContent = S.tasksDoneToday; addLog(o, t);
    }
    // tired agents go and rest; rested ones sometimes stretch their legs after a stretch of work
    S.agents.forEach(o => {
      if (!atDesk(o) || o.task || S.focused === o) return;
      const busyHere = onBreakCount(o.a.floorId);
      if (o.energy < 32 && busyHere < 4) goBreak(o);
      else if (now() > o.workUntil && busyHere < 2 && Math.random() < (o.a.working ? 0.12 : 0.25)) goBreak(o);
    });
  }
  setTimeout(taskTick, rand(2200, 4200));
}
// save energy now and then so tired agents stay tired after a reload
setInterval(() => S.agents.forEach(saveAgentState), 60000);

/* --------------------------------------------------------------- restore saved work */
async function restore() {
  const kind = await initStore();
  if (kind === 'none') { saveState('بدون حفظ', false); return; }
  let data;
  try { data = await loadAll(); } catch { saveState('تعذّر التحميل', false); return; }
  if (!data) return;
  // floors and their layouts (the main floor may have been rearranged)
  const floors = data.floors.filter(f => f && typeof f.id === 'string' && Array.isArray(f.objects)).sort((a, b) => (a.order || 0) - (b.order || 0));
  for (const f of floors) {
    if (f.id === 'main') {
      const main = S.floors[0];
      main.objects.forEach(o => undrawObj(o.id));
      main.objects = f.objects; main.name = f.name || main.name; main.lit = !!f.lit;
      if (f.size === 20) expandFloor(main, false);
      main.objects.forEach(o => drawObj(main, o));
      rebuildNav(main);
      // layouts saved before the reception desk existed get one in free space
      if (!main.objects.some(o => o.type === 'reception')) {
        const r = { id: 'reception', type: 'reception', x: 5.6, z: -5.4, rot: 0 }, f = footprint(r);
        const clash = main.objects.some(x => { const p = footprint(x); return p.x1 < f.x2 && p.x2 > f.x1 && p.z1 < f.z2 && p.z2 > f.z1; });
        if (!clash) { main.objects.push(r); drawObj(main, r); rebuildNav(main); saveFloor(main); }
      }
      // layouts saved before room lights existed get a few, where they fit
      if (!main.lit && !main.objects.some(o => o.type === 'lamp' || o.type === 'pendant')) {
        defaultLights().forEach(l => {
          const f = footprint(l), over = l.type === 'pendant';
          const clash = !over && main.objects.some(x => x.type !== 'pendant' && (() => { const p = footprint(x); return p.x1 < f.x2 && p.x2 > f.x1 && p.z1 < f.z2 && p.z2 > f.z1; })());
          if (!clash) { main.objects.push({ ...l }); drawObj(main, l); }
        });
        rebuildNav(main); main.lit = true; saveFloor(main);
      }
      // layouts saved before the CEO existed get an executive office in free space
      if (!main.objects.some(o => o.agentKey === 'ceo')) {
        const spot = findOfficeSpot(main);
        if (spot) { const o = { id: 'o_ceo', type: 'office', x: spot.x, z: spot.z, rot: spot.rot || 0, door: spot.door, agentKey: 'ceo', exec: true }; main.objects.push(o); drawObj(main, o); rebuildNav(main); saveFloor(main); }
      }
      S.agents.forEach(ag => { if (!main.objects.some(o => o.id === ag.a.officeId)) { const o = main.objects.find(x => x.agentKey === ag.a.key); if (o) ag.a.officeId = o.id; } bindOffice(ag); });
    } else if (!floorById(f.id)) {
      const fl = { id: f.id, name: f.name || 'طابق', dept: f.dept || '', color: f.color || '#3d6bff', order: f.order || S.floors.length, size: f.size === 20 ? 20 : 16, objects: f.objects };
      S.floors.push(fl); buildFloor(fl); dispatchEvent(new Event('deskhive-floor-added'));
    }
  }
  restoreAgents(data.agents);
  for (const st of data.agentstate) { const ag = byKey(st.id); if (ag && typeof st.energy === 'number') { ag.energy = st.energy; ag.moodBoost = st.mood || 0; } }
  for (const c of data.chats) {
    const ag = byKey(c.id), turns = Array.isArray(c.turns) ? c.turns : [];
    if (ag) ag.a.history = turns.filter(t => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content);
  }
  S.meetings = data.meetings.filter(m => typeof m.topic === 'string' && Array.isArray(m.lines));
  S.tasks = data.tasks.filter(t => typeof t.title === 'string');
  S.files = data.files.filter(f => typeof f.content === 'string');
  S.events = data.events.filter(e => typeof e.text === 'string');
  S.notes = data.notes.filter(n => typeof n.text === 'string');
  S.goals = (data.goals || []).filter(g => typeof g.text === 'string' && Array.isArray(g.taskIds));
  S.approvals = (data.approvals || []).filter(a => typeof a.title === 'string');
  restorePlan(data.prefs); restoreReplay(data.replay); restoreMemory(data.memory); restoreKnowledge(data.kb); restoreProjects(data.projects); restoreRoutines(data.routines); setTimeout(nudgeProfile, 12000); restoreXp(data.agentstate); restoreUsage(data.agentstate);
  restoreTasks(); initRoutines({ createTask }); restoreGoals(); setTimeout(maybeBrief, 4000); restoreApprovals(); restoreLog(); renderNotes(); renderTeam(); renderFloorsUI();
  if (S.focused) openAgentPanel(S.focused);
  if (S.panel === 'meet' && !S.meeting.running) renderMeetHome();
  saveState(kind === 'db' ? 'محفوظ في حسابك' : 'محفوظ في هذا المتصفح');
}

/* --------------------------------------------------------------- start */
initAI(); updateMode();
initVoice();
initNotes();
initDayCycle();
initChat({ onDeleteAgent: deleteAgent });
initPanel();
initBoard();
initGoals();
initApprovals();
initReplay();
initGrowth();
initReception();
$('projects-btn').onclick = openProjects;
$('routines-btn').onclick = openRoutines;
$('set-export').onclick = async () => {
  const data = await exportAll(); if (!data) return notify({ text: 'لا يوجد حفظ في هذه الصفحة لتصديره.', kind: 'error' });
  const name = `deskhive-office-${new Date().toISOString().slice(0, 10)}.json`, text = JSON.stringify(data);
  try { const dl = await window.claude?.use?.('downloads'); if (dl) { await dl.save({ filename: name, data: text }); return; } } catch { /* fall back */ }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click();
};
$('set-import').onclick = () => $('set-import-file').click();
$('set-import-file').onchange = async e => {
  const f = e.target.files?.[0]; if (!f) return;
  try {
    const n = await importAll(JSON.parse(await f.text()));
    notify({ text: `استُورد ${n} عنصراً. سيُعاد تحميل المكتب الآن.`, kind: 'done' }); setTimeout(() => location.reload(), 1500);
  } catch (err) { notify({ text: 'تعذّر الاستيراد: ' + (err?.message || ''), kind: 'error' }); }
  e.target.value = '';
};
if (window.DESKHIVE_STANDALONE) {
  const showAccount = () => { const acc = window.DESKHIVE_ACCOUNT; if (!acc) return setTimeout(showAccount, 1000); $('set-account').hidden = false; $('set-account-email').textContent = acc.email; $('set-logout').onclick = () => acc.signOut(); };
  showAccount();
}
$('set-kb').onclick = () => { $('settings-pop').hidden = true; openKnowledge(); };
$('set-services').onclick = () => { $('settings-pop').hidden = true; openServices(); };
$('set-store').onclick = () => { $('settings-pop').hidden = true; openStore(); };
$('set-plans').onclick = () => { $('settings-pop').hidden = true; openPlans(); };
$('set-invite').onclick = () => { $('settings-pop').hidden = true; openInvite(); };
initMultiuser();
initIntegrations();
$('goal-new').onclick = openNewGoal;
on('show-goals', () => setTab('tasks'));
initMeeting({ setTab, setTabState });
initNewAgent({ select, setTabState, showPanel, viewFloor, focusLounge: () => focusOn(new THREE.Vector3(3, 0.5, 0), isPhone() ? 0.95 : 1) });
initFloorsUI({ viewFloor, select, renderTeam });
initEditor({ select, showPanel, focusRoom });
initDashboard({ onClose: () => setTab('office') });
initManager({ pickAgent });
initQuality();
initThemes();
initSettings();
renderTeam();
restore();
runBuild();
setTimeout(taskTick, 3500);
startLoop();
export { select, showPanel, setTab, renderTeam, hasRoom, FL };
// ?debug exposes state for automated checks
if (new URLSearchParams(location.search).has('debug')) import('./nav.js').then(nav => import('./floors.js').then(fl => import('./layout.js').then(ly => { window.__office = { S, camera, THREE, emit, nav, fl, ly, select }; import('./approvals.js').then(ap => { window.__office.decide = ap.decide; }); import('./workspace.js').then(ws => { window.__office.askPostSlack = ws.askPostSlack; }); })));
