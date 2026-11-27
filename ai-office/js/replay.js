// Replay: the office records where every agent was twice a second, plus what they said and did.
// The timeline lets you scrub back and watch the day again at 1x, 2x or 4x.
import { $, el, button, on, fmtTime, clip } from './util.js';
import { S, byKey } from './state.js';
import { onFrame } from './scene.js';
import { FL } from './floors.js';
import { SIT } from './data.js';
import { put } from './store.js';

const STEP = 500, CHUNK = 5 * 60 * 1000, KEEP = 24; // 0.5 s frames, 5-minute chunks, 2 hours
const CODES = { desk: 0, walk: 2, away: 3, stand: 3, elev: 5 };
let frames = [];     // [{t, a: [[key, floor, x, z, rot, code], ...]}]
let marks = [];      // [{t, key, text, kind}]
let lastRec = 0, chunkStart = 0, dirty = false;

const r2 = v => Math.round(v * 100) / 100;
function record(now) {
  if (S.replay || now - lastRec < STEP) return;
  lastRec = now;
  frames.push({ t: now, a: S.agents.map(o => {
    const st = o.mv.state, code = st === 'desk' ? ((o.a.working || o.task) ? 1 : 0) : st === 'away' && o.mv.sitting ? 4 : CODES[st] ?? 3;
    return [o.a.key, o.curFloor, r2(o.robot.position.x), r2(o.robot.position.z), r2(o.robot.rotation.y), code];
  }) });
  const oldest = now - KEEP * CHUNK;
  while (frames.length && frames[0].t < oldest) frames.shift();
  while (marks.length && marks[0].t < oldest) marks.shift();
  dirty = true;
  if (now - chunkStart >= CHUNK) { saveChunk(); chunkStart = now - (now % CHUNK); }
}
function saveChunk() {
  if (!dirty) return; dirty = false;
  const start = Date.now() - (Date.now() % CHUNK);
  const fr = frames.filter(f => f.t >= start - CHUNK), mk = marks.filter(m => m.t >= start - CHUNK);
  put('replay', 'c' + (start - CHUNK), { at: start - CHUNK, frames: fr.filter(f => f.t < start), marks: mk.filter(m => m.t < start) });
  put('replay', 'c' + start, { at: start, frames: fr.filter(f => f.t >= start), marks: mk.filter(m => m.t >= start) });
}
on('bubble', (ag, text) => { if (!S.replay) marks.push({ t: Date.now(), key: ag.a.key, text, kind: 'say' }); });
on('events-changed', () => { const e = S.events[0]; if (e && !S.replay) marks.push({ t: e.at, key: e.agentKey, text: e.text, kind: 'event' }); });
addEventListener('pagehide', saveChunk);
setInterval(saveChunk, 60000);

/** Saved chunks from earlier visits (newest two hours). */
export function restoreReplay(docs) {
  const old = (docs || []).filter(d => Array.isArray(d.frames)).sort((a, b) => a.at - b.at);
  const f = old.flatMap(d => d.frames), m = old.flatMap(d => d.marks || []);
  frames = [...f.filter(x => !frames.length || x.t < frames[0].t), ...frames];
  marks = [...m.filter(x => !marks.length || x.t < marks[0].t), ...marks];
}

/* ------------------------------------------------------------------ playback */
let saved = null; // live poses to put back after the replay
const R = () => S.replay;
function enter() {
  if (frames.length < 4) { $('rp-info').textContent = 'لا يوجد تسجيل كافٍ بعد. اترك المكتب يعمل قليلاً ثم عد.'; return false; }
  saved = S.agents.map(o => ({ o, parent: o.robot.parent, floor: o.curFloor, p: o.robot.position.clone(), r: o.robot.rotation.y }));
  S.replay = { t: frames[0].t, playing: true, speed: 1, lastBubble: 0 };
  document.body.classList.add('replaying');
  return true;
}
function exit() {
  if (!S.replay) return;
  saved?.forEach(({ o, parent, floor, p, r }) => { if (!S.agents.includes(o)) return; parent?.add(o.robot); o.curFloor = floor; o.robot.position.copy(p); o.robot.rotation.y = r; o.robot.visible = true; o.bubble.classList.remove('on'); });
  saved = null; S.replay = null;
  document.body.classList.remove('replaying');
  $('replay-bar').hidden = true;
}
function find(t) { // last frame index at or before t
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (frames[m].t <= t) lo = m; else hi = m - 1; }
  return lo;
}
const lerpAng = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
function apply(t) {
  const i = find(t), A = frames[i], B = frames[Math.min(i + 1, frames.length - 1)];
  const k = B.t > A.t ? Math.max(0, Math.min(1, (t - A.t) / (B.t - A.t))) : 0;
  const bm = new Map(B.a.map(x => [x[0], x]));
  const present = new Set();
  A.a.forEach(([key, floor, x, z, rot, code]) => {
    const o = byKey(key); if (!o) return; present.add(o);
    const nb = bm.get(key) || [key, floor, x, z, rot, code];
    const g = FL.groups.get(floor); if (g && o.robot.parent !== g) g.add(o.robot);
    o.curFloor = floor;
    o.robot.visible = true;
    o.robot.position.set(x + (nb[2] - x) * k, 0, z + (nb[3] - z) * k);
    o.robot.rotation.y = lerpAng(rot, nb[4], k);
    const walk = code === 2, sit = code === 0 || code === 1 || code === 4;
    const ph = t / 180;
    o.legs.forEach((l, j) => { l.rotation.x = walk ? Math.sin(ph + j * Math.PI) * 0.6 : sit ? -SIT : 0; });
    if (code === 1) { o.arms[0].rotation.x = -1.15 + Math.sin(t / 60) * 0.13; o.arms[1].rotation.x = -1.15 + Math.sin(t / 60 + 2.4) * 0.13; }
    else if (walk) { o.arms[0].rotation.x = -Math.sin(ph) * 0.5; o.arms[1].rotation.x = Math.sin(ph) * 0.5; }
    else { o.arms[0].rotation.x = -0.15; o.arms[1].rotation.x = -0.15; }
    o.robot.position.y = walk ? Math.abs(Math.sin(ph)) * 0.06 : code === 4 ? 0.07 : 0;
  });
  S.agents.forEach(o => { if (!present.has(o)) o.robot.visible = false; }); // agents who did not exist yet
  // speech bubbles from that moment
  const recent = marks.filter(m => m.kind === 'say' && m.t <= t && t - m.t < 2500);
  S.agents.forEach(o => { const m = recent.filter(x => x.key === o.a.key).pop(); o.bubble.textContent = m ? m.text : ''; o.bubble.classList.toggle('on', !!m); });
  const ev = marks.filter(m => m.kind === 'event' && m.t <= t).pop();
  $('rp-info').textContent = ev ? `${byKey(ev.key)?.a.name || ''}: ${clip(ev.text, 80)}` : '';
}

function renderBar() {
  const start = frames[0]?.t || Date.now(), end = frames[frames.length - 1]?.t || Date.now();
  const range = $('rp-range'); range.min = start; range.max = end; range.step = 250;
  const strip = $('rp-marks'); strip.replaceChildren();
  marks.filter(m => m.kind === 'event').forEach(m => {
    const tick = el('i'); tick.style.insetInlineStart = ((m.t - start) / Math.max(1, end - start) * 100) + '%';
    tick.style.background = byKey(m.key)?.a.color || '#94a3b8'; tick.title = `${fmtTime(m.t)} · ${m.text}`;
    strip.append(tick);
  });
}
onFrame(dt => {
  record(Date.now());
  const rp = R(); if (!rp) return;
  if (rp.playing) {
    rp.t += dt * 1000 * rp.speed;
    const end = frames[frames.length - 1].t;
    if (rp.t >= end) { rp.t = end; rp.playing = false; $('rp-play').textContent = '▶'; }
  }
  apply(rp.t);
  $('rp-range').value = rp.t;
  $('rp-time').textContent = new Date(rp.t).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
});

export function openReplay() {
  $('replay-bar').hidden = false;
  if (!enter()) return;
  renderBar(); $('rp-play').textContent = '❚❚';
}
export function initReplay() {
  $('replay').onclick = () => (S.replay ? exit() : openReplay());
  $('rp-exit').onclick = exit;
  $('rp-play').onclick = () => { const rp = R(); if (!rp) return; if (!rp.playing && rp.t >= frames[frames.length - 1].t) rp.t = frames[0].t; rp.playing = !rp.playing; $('rp-play').textContent = rp.playing ? '❚❚' : '▶'; };
  $('rp-range').addEventListener('input', e => { const rp = R(); if (rp) { rp.t = +e.target.value; } });
  document.querySelectorAll('#rp-speeds button').forEach(b => {
    b.onclick = () => { const rp = R(); if (!rp) return; rp.speed = +b.dataset.s; document.querySelectorAll('#rp-speeds button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); };
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && S.replay) exit(); });
}
export { button };
