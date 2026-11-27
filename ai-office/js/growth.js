// Agents grow: they remember your notes and apply them, earn experience (XP) and levels that unlock skills,
// compete for "employee of the month", and the office celebrates big wins with confetti and applause.
import { el, button, uid, on, emit, clip } from './util.js';
import { S, byKey, isFemale } from './state.js';
import { THREE, onFrame, world } from './scene.js';
import { FL } from './floors.js';
import { put } from './store.js';
import { notify } from './notify.js';
import { showBubble, nudgeMood } from './agents.js';
import { addEvent } from './log.js';
import { playChime } from './audio.js';

/* ------------------------------------------------------------------ memory */
export const memoryOf = ag => (ag.a.memory ||= []);
const saveMemory = ag => put('memory', ag.a.key, { notes: memoryOf(ag).slice(0, 30), at: Date.now() });
export function remember(ag, text, source = 'user') {
  const t = text.trim().slice(0, 300); if (!t) return;
  if (memoryOf(ag).some(n => n.text === t)) return;
  memoryOf(ag).unshift({ id: uid('m'), text: t, source, at: Date.now() });
  ag.a.memory.length = Math.min(ag.a.memory.length, 30);
  saveMemory(ag); emit('memory-changed', ag);
}
export function forget(ag, id) { ag.a.memory = memoryOf(ag).filter(n => n.id !== id); saveMemory(ag); emit('memory-changed', ag); }
/** Added to every prompt for this agent. */
export function memoryPrompt(ag) {
  const notes = memoryOf(ag); if (!notes.length) return '';
  return `\nملاحظات المستخدم التي تحفظها وتطبقها دائماً في عملك:\n${notes.slice(0, 15).map(n => '- ' + n.text).join('\n')}`;
}
export function restoreMemory(docs) {
  (docs || []).forEach(d => { const ag = byKey(d.id); if (ag && Array.isArray(d.notes)) ag.a.memory = d.notes.filter(n => n && typeof n.text === 'string'); });
}

/* ------------------------------------------------------------------ XP and levels */
export const LEVELS = [
  { min: 0, name: 'متدرب', skill: '', about: 'يتعلم أساسيات العمل' },
  { min: 250, name: 'موظف', skill: 'ملخص تنفيذي', about: 'يبدأ كل ملف بملخص تنفيذي من ثلاثة أسطر' },
  { min: 800, name: 'خبير', skill: 'مراجعة ذاتية', about: 'يراجع عمله بنفسه قبل التسليم ويقترح الخطوة التالية' },
];
export const levelOf = ag => { const xp = ag.a.xp || 0; let i = 0; LEVELS.forEach((l, k) => { if (xp >= l.min) i = k; }); return { ...LEVELS[i], index: i, next: LEVELS[i + 1] }; };
/** Extra instructions unlocked by level, added to work prompts. */
export function skillsPrompt(ag) {
  const i = levelOf(ag).index; const out = [];
  if (i >= 1) out.push('- ابدأ الملف بعد العنوان بـ«ملخص تنفيذي» من ثلاثة أسطر.');
  if (i >= 2) out.push('- قبل أن تسلّم، راجع عملك بنفسك وصحّح الأخطاء والثغرات، واختم بسطر «الخطوة التالية المقترحة».');
  return out.length ? `\nمهاراتك المكتسبة (مستواك ${levelOf(ag).name}):\n${out.join('\n')}` : '';
}
const monthKey = () => new Date().toISOString().slice(0, 7);
export const monthXp = ag => (ag.a.xpMonth?.m === monthKey() ? ag.a.xpMonth.xp : 0);
export function giveXp(ag, n, why) {
  if (!ag || !n) return;
  const before = levelOf(ag).index;
  ag.a.xp = (ag.a.xp || 0) + n;
  ag.a.xpMonth = { m: monthKey(), xp: monthXp(ag) + n };
  put('agentstate', ag.a.key, { energy: Math.round(ag.energy), mood: Math.round(ag.moodBoost), xp: ag.a.xp, xpMonth: ag.a.xpMonth, at: Date.now() });
  emit('xp-changed', ag, n, why);
  const after = levelOf(ag);
  if (after.index > before) {
    addEvent(ag, `${isFemale(ag.a) ? 'ترقّت' : 'ترقّى'} إلى مستوى «${after.name}» وفتح مهارة «${after.skill}»`);
    notify({ text: `${ag.a.name} ${isFemale(ag.a) ? 'ترقّت' : 'ترقّى'} إلى «${after.name}»! مهارة جديدة: ${after.skill}.`, kind: 'info', agentKey: ag.a.key });
    showBubble(ag, `صرت ${after.name}!`, 3500); nudgeMood(ag, 15);
    celebrate(ag);
  }
  updateBoard();
}
export function restoreXp(states) {
  (states || []).forEach(st => { const ag = byKey(st.id); if (!ag) return; if (typeof st.xp === 'number') ag.a.xp = st.xp; if (st.xpMonth?.m) ag.a.xpMonth = st.xpMonth; });
  lastLeader = leader()?.a.key || ''; updateBoard();
}

// where XP comes from
on('step-done', ag => giveXp(ag, 40, 'أنهى خطوة عمل'));
on('task-approved', t => t.chain.forEach(k => giveXp(byKey(k), 25, 'وافقت على عمله')));
on('goal-approved', g => { giveXp(byKey('ceo'), 80, 'هدف منجز'); g.taskIds.forEach(id => { const t = S.tasks.find(x => x.id === id); if (t) giveXp(byKey(t.chain[0]), 30, 'شارك في هدف'); }); celebrate(byKey('ceo'), true); });
on('chat-replied', ag => giveXp(ag, 5, 'رد على سؤالك'));
on('meeting-ended', () => S.agents.forEach(o => { if (!o.task) giveXp(o, 10, 'حضر اجتماعاً'); }));

/* ------------------------------------------------------------------ employee of the month board */
let board, boardTex, boardCtx, lastLeader = '';
const leader = () => [...S.agents].sort((a, b) => monthXp(b) - monthXp(a))[0];
function makeBoard() {
  const g = FL.groups.get('main'); if (!g) return;
  const c = document.createElement('canvas'); c.width = 512; c.height = 320; boardCtx = c.getContext('2d');
  boardTex = new THREE.CanvasTexture(c); boardTex.colorSpace = THREE.SRGBColorSpace;
  board = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.19), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }));
  board.position.set(-7.97, 3.55, -0.85); board.rotation.y = Math.PI / 2;
  g.add(board);
}
export function updateBoard() {
  if (!board) makeBoard(); if (!boardCtx) return;
  const x = boardCtx, top = leader(), W = 512, H = 320;
  x.clearRect(0, 0, W, H);
  x.fillStyle = '#0b0f24'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#ffd166'; x.lineWidth = 10; x.strokeRect(5, 5, W - 10, H - 10);
  x.direction = 'rtl'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#ffd166'; x.font = '700 40px "Cairo", sans-serif'; x.fillText('موظف الشهر', W / 2, 50);
  if (!top || !monthXp(top)) { x.fillStyle = '#8790b6'; x.font = '500 26px "IBM Plex Sans Arabic", sans-serif'; x.fillText('لم يُحسم بعد', W / 2, 170); }
  else {
    x.fillStyle = top.a.color; x.beginPath(); x.roundRect(W / 2 - 45, 90, 90, 90, 18); x.fill();
    x.fillStyle = '#0b1024'; x.beginPath(); x.roundRect(W / 2 - 30, 120, 60, 30, 8); x.fill();
    x.fillStyle = '#cdf0ff'; x.beginPath(); x.arc(W / 2 - 13, 135, 6, 0, 7); x.arc(W / 2 + 13, 135, 6, 0, 7); x.fill();
    x.fillStyle = '#ffffff'; x.font = '700 38px "Cairo", sans-serif'; x.fillText(top.a.name, W / 2, 218);
    x.fillStyle = '#c9d2f5'; x.font = '500 24px "IBM Plex Sans Arabic", sans-serif';
    x.fillText(`${top.a.role} · ${monthXp(top)} نقطة · ${levelOf(top).name}`, W / 2, 262);
  }
  boardTex.needsUpdate = true;
  if (top && monthXp(top) && top.a.key !== lastLeader) {
    const first = !lastLeader; lastLeader = top.a.key;
    if (!first) { notify({ text: `${top.a.name} ${isFemale(top.a) ? 'أصبحت' : 'أصبح'} موظف الشهر!`, kind: 'info', agentKey: top.a.key }); celebrate(top, true); }
  }
}

/* ------------------------------------------------------------------ celebrations */
const pieces = [];
const COLORS = ['#ffd166', '#ff5c8a', '#4d7cff', '#2fe08a', '#b06bff', '#ff8a3d', '#ffffff'];
/** Confetti over an agent and applause from everyone on that floor. big = bigger burst. */
export function celebrate(ag, big = false) {
  if (!ag) return;
  const parent = ag.robot.parent || world;
  const n = big ? 160 : 70;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.05), new THREE.MeshBasicMaterial({ color: COLORS[i % COLORS.length], side: THREE.DoubleSide, toneMapped: false }));
    m.position.set(ag.robot.position.x + (Math.random() - 0.5) * 0.6, 2.6, ag.robot.position.z + (Math.random() - 0.5) * 0.6);
    const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * (big ? 3 : 2);
    m.userData = { v: new THREE.Vector3(Math.cos(a) * sp, 2.5 + Math.random() * 3, Math.sin(a) * sp), r: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), life: 3 + Math.random() };
    parent.add(m); pieces.push(m);
  }
  S.agents.forEach(o => { if (o.curFloor === ag.curFloor) { o.clapT = big ? 3 : 2; if (o !== ag && Math.random() < 0.5) showBubble(o, pickCheer(o), 2200); } });
  playChime();
}
const CHEERS = ['برافو!', 'أحسنت!', 'عمل رائع!', 'مبروك!', 'يستاهل!'];
const pickCheer = () => CHEERS[(Math.random() * CHEERS.length) | 0];

onFrame((dt, t) => {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const m = pieces[i], u = m.userData;
    u.life -= dt; u.v.y -= 6 * dt; u.v.multiplyScalar(1 - dt * 0.8);
    m.position.addScaledVector(u.v, dt); m.rotation.x += u.r.x * dt; m.rotation.y += u.r.y * dt;
    if (m.position.y < 0.02) { m.position.y = 0.02; u.v.set(0, 0, 0); }
    if (u.life <= 0) { m.parent?.remove(m); m.geometry.dispose(); m.material.dispose(); pieces.splice(i, 1); }
  }
  // applause: hands together and apart quickly (overrides the normal arm pose)
  S.agents.forEach(o => {
    if (!(o.clapT > 0) || S.replay) return;
    o.clapT -= dt;
    const s = Math.sin(t * 22);
    o.arms[0].rotation.x = -1.35; o.arms[1].rotation.x = -1.35;
    o.arms[0].rotation.z = -0.45 - s * 0.25; o.arms[1].rotation.z = 0.45 + s * 0.25;
    if (o.clapT <= 0) { o.arms[0].rotation.z = 0; o.arms[1].rotation.z = 0; }
  });
});

/* ------------------------------------------------------------------ panel pieces */
export function growthCard(ag) {
  const lv = levelOf(ag), xp = ag.a.xp || 0;
  const box = el('div', 'growth');
  const head = el('div', 'row'); head.style.alignItems = 'center';
  const badge = el('span', 'lvl', lv.name); badge.dataset.l = lv.index;
  head.append(badge, el('span', 'muted', `${xp} نقطة خبرة · هذا الشهر ${monthXp(ag)}`));
  const bar = el('div', 'bar'); bar.append(el('i'));
  const pct = lv.next ? (xp - lv.min) / (lv.next.min - lv.min) : 1;
  bar.firstChild.style.width = Math.round(pct * 100) + '%'; bar.style.setProperty('--c', '#ffd166');
  box.append(head, bar, el('small', 'muted', lv.next ? `باقي ${lv.next.min - xp} نقطة إلى «${lv.next.name}» ومهارة «${lv.next.skill}»` : 'أعلى مستوى'));
  const skills = LEVELS.filter((l, i) => i <= lv.index && l.skill).map(l => `${l.skill}: ${l.about}`);
  if (skills.length) box.append(el('small', '', 'المهارات: ' + skills.join(' · ')));
  return box;
}
/** The "الذاكرة" tab: what the agent remembers, add or remove notes. */
export function renderMemory(ag, box) {
  box.replaceChildren();
  box.append(el('p', 'lead', `ما تكتبه هنا يتذكره ${ag.a.name} ويطبقه في كل عمل ومحادثة. ملاحظاتك عند «طلب تعديل» تُحفظ هنا تلقائياً، وكذلك أي رسالة تبدأ بـ«تذكّر».`));
  const ta = el('textarea'); ta.rows = 2; ta.id = 'mem-new'; ta.placeholder = 'مثلاً: اكتب التقارير بالأرقام دائماً، وتجنّب المقدمات الطويلة';
  const add = button('btn primary', 'احفظ في الذاكرة', () => { if (ta.value.trim()) { remember(ag, ta.value); ta.value = ''; } });
  const row = el('div', 'row'); row.append(add);
  box.append(ta, row);
  const notes = memoryOf(ag);
  if (!notes.length) { box.append(el('p', 'empty', 'لا توجد ملاحظات محفوظة بعد.')); return; }
  const ul = el('ul', 'tlist');
  notes.forEach(n => {
    const li = el('li'); li.append(el('span', '', n.text), el('small', '', n.source === 'feedback' ? 'من طلب تعديل' : n.source === 'chat' ? 'من المحادثة' : 'أضفتها أنت'));
    li.append(button('linkish', 'احذف', () => forget(ag, n.id))); ul.append(li);
  });
  box.append(ul);
}
export function initGrowth() { makeBoard(); updateBoard(); }
export { clip };
