// Agents: robots that sit in their office, walk the walking grid (avoiding walls and each other),
// ride the elevator between floors, take breaks when tired, greet colleagues, and show labels.
import { THREE, camera, std, glow, mesh, legMat, ring3d, burst, sendPulse, onFrame, animateIn, corePos, RoundedBoxGeometry, build } from './scene.js';
import { S, isFemale } from './state.js';
import { FL, floorById, spotsOn, elevatorOf, drawObj, undrawObj } from './floors.js';
import { officeSeat, officeDoorOut, CATALOG } from './layout.js';
import { findPath } from './nav.js';
import { SIT } from './data.js';
import { gsap, D, el, rand, pick, now, emit } from './util.js';
import { dayPart } from './daycycle.js';

/* ------------------------------------------------------------------ robot looks */
export const SHAPES = {
  head: { box: 'مربع', round: 'دائري', tall: 'طويل' },
  antenna: { ball: 'هوائي', double: 'هوائيان', none: 'بدون' },
  acc: { none: 'بدون', headphones: 'سماعات', cap: 'قبعة' },
};
function buildRobot(a) {
  const sh = a.shape || {};
  const robot = new THREE.Group();
  const shell = std(a.color, { roughness: 0.35, metalness: 0.25 });
  mesh(new RoundedBoxGeometry(0.78, 0.78, 0.58, 4, 0.2), shell, 0, 0.95, 0, robot);
  const headPivot = new THREE.Group(); headPivot.position.set(0, 1.38, 0); robot.add(headPivot);
  let top = 0.68;
  if (sh.head === 'round') { const h = mesh(new THREE.SphereGeometry(0.42, 28, 20), shell, 0, 0.36, 0, headPivot); h.scale.set(1, 0.88, 0.9); top = 0.72; }
  else if (sh.head === 'tall') { mesh(new RoundedBoxGeometry(0.72, 0.86, 0.62, 4, 0.2), shell, 0, 0.46, 0, headPivot); top = 0.9; }
  else mesh(new RoundedBoxGeometry(0.86, 0.64, 0.66, 4, 0.22), shell, 0, 0.36, 0, headPivot);
  const faceY = sh.head === 'tall' ? 0.5 : 0.36, faceZ = sh.head === 'round' ? 0.33 : 0.32;
  mesh(new RoundedBoxGeometry(0.62, 0.38, 0.06, 3, 0.1), std('#0a0f24', { roughness: 0.2, metalness: 0.6 }), 0, faceY, faceZ, headPivot);
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#c9f2ff').multiplyScalar(2.2), toneMapped: false });
  const eyes = [-0.14, 0.14].map(ex => mesh(new THREE.CapsuleGeometry(0.045, 0.06, 4, 10), eyeMat, ex, faceY + 0.01, faceZ + 0.04, headPivot));
  const antennaMat = glow(a.color);
  const antennas = [];
  if (sh.antenna !== 'none') {
    const xs = sh.antenna === 'double' ? [-0.22, 0.22] : [0];
    xs.forEach(x => {
      const stick = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), legMat, x, top + 0.1, 0, headPivot); stick.rotation.z = -x * 1.2;
      antennas.push(mesh(new THREE.SphereGeometry(0.06, 14, 12), antennaMat, x * 1.35, top + 0.22, 0, headPivot));
    });
  }
  if (sh.acc === 'headphones') {
    const band = mesh(new THREE.TorusGeometry(0.46, 0.035, 8, 28, Math.PI), std('#0c1230'), 0, faceY, 0, headPivot);
    band.rotation.z = 0; band.rotation.y = Math.PI / 2;
    [-0.46, 0.46].forEach(x => mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16), std('#0c1230'), x, faceY, 0, headPivot).rotation.z = Math.PI / 2);
  } else if (sh.acc === 'cap') {
    const cap = mesh(new THREE.SphereGeometry(0.4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std('#0c1230'), 0, top - 0.06, 0, headPivot); cap.scale.set(1.05, 0.55, 1.05);
    mesh(new THREE.BoxGeometry(0.5, 0.03, 0.3), std('#0c1230'), 0, top - 0.06, 0.45, headPivot);
  }
  const arms = [-1, 1].map(s => {
    const pivot = new THREE.Group(); pivot.position.set(0.47 * s, 1.18, 0.05); robot.add(pivot);
    mesh(new THREE.CapsuleGeometry(0.085, 0.42, 4, 10), shell, 0, -0.26, 0, pivot);
    return pivot;
  });
  // a cup held while drinking
  const cup = mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.14, 12), std('#e8ecff'), 0, -0.55, 0.06, arms[1]); cup.visible = false;
  const legs = [-1, 1].map(s => {
    const pivot = new THREE.Group(); pivot.position.set(0.19 * s, 0.6, 0); pivot.rotation.x = -SIT; robot.add(pivot);
    mesh(new THREE.CapsuleGeometry(0.1, 0.36, 4, 10), shell, 0, -0.29, 0, pivot);
    return pivot;
  });
  return { robot, headPivot, eyes, arms, legs, antennas, cup };
}

/* ------------------------------------------------------------------ creating an agent */
export const atDesk = ag => ag.mv.state === 'desk';
const groupOf = floorId => FL.groups.get(floorId);

/** Create the robot for agent data `a` (a.floorId, a.officeId set). The office is redrawn in the agent's color. */
export function makeAgent(a, live = false) {
  const parts = buildRobot(a);
  const tag = el('div', 'tag'); tag.style.setProperty('--c', a.color);
  const bubbleEl = el('div', 'bubble'); const pill = el('div', 'pill'); pill.append(el('span', 'dot'), document.createTextNode(a.name));
  const prog = el('div', 'prog'); prog.append(el('i'));
  tag.append(bubbleEl, prog, pill); $labels().appendChild(tag);
  const ag = { a, ...parts, tag, bubble: bubbleEl, prog, progress: -1, curFloor: a.floorId,
    mv: { state: 'desk', path: [], legs: [], sitting: true, phase: 0, waitT: 0, speed: 1.5, waiters: [] },
    energy: a.energy ?? rand(65, 95), moodBoost: 0, workUntil: now() + rand(20, 50), lastChat: 0, stretchT: 0,
    selA: 0, boost: 0, kick: 0, blinkAt: rand(1, 5), bubbleTimer: null };
  S.agents.push(ag);
  groupOf(a.floorId).add(ag.robot);
  bindOffice(ag, live);
  ag.robot.userData.home = ag.robot.position.clone(); ag.robot.userData.scaleHome = new THREE.Vector3(1, 1, 1);
  if (!live) build(ag.robot, 'pop', 1.35 + S.agents.length * 0.1);
  if (live) { const tl = gsap.timeline(); animateIn(tl, ag.robot, 'pop', 0.5); tl.call(() => { ring3d(ag.parts.ring, a.color, 3.2, 1.2, 0.4); burst(ag.parts.ring, a.color, 60, 4, 1.6, 0.12); }, null, 0.9); }
  return ag;
}
const $labels = () => document.getElementById('labels');

/** (Re)draw the agent's office in its colour and seat the robot there. Called after the office moves too. */
export function bindOffice(ag, live = false) {
  const rec0 = FL.drawn.get(ag.a.officeId); if (!rec0) return;
  const floor = floorById(rec0.floorId);
  undrawObj(ag.a.officeId);
  const rec = drawObj(floor, rec0.obj, live);
  if (ag.parts?.hit) { const i = S.hitMeshes.indexOf(ag.parts.hit); if (i >= 0) S.hitMeshes.splice(i, 1); }
  ag.rec = rec; ag.parts = rec.parts;
  ag.parts.hit.userData.ag = ag; S.hitMeshes.push(ag.parts.hit);
  ag.seat = officeSeat(rec.obj);
  ag.a.floorId = rec.floorId;
  if (atDesk(ag)) {
    if (ag.robot.parent !== groupOf(rec.floorId)) groupOf(rec.floorId).add(ag.robot);
    ag.curFloor = rec.floorId;
    ag.robot.position.set(ag.seat.x, 0, ag.seat.z); ag.robot.rotation.y = ag.seat.face;
  }
  rebuildBeam(ag);
}
export function rebuildBeam(ag) {
  if (ag.beam) { ag.beam.line.parent?.remove(ag.beam.line); ag.beam.line.geometry.dispose(); ag.beam = null; }
  const coreFloor = S.floors.find(f => f.objects.some(o => o.type === 'core'));
  if (!coreFloor || coreFloor.id !== ag.a.floorId) return;
  const from = new THREE.Vector3(ag.seat.x, 2.4, ag.seat.z);
  const mid = from.clone().lerp(corePos, 0.5); mid.y += 2.6;
  const curve = new THREE.QuadraticBezierCurve3(from, mid, corePos.clone());
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(60)),
    new THREE.LineDashedMaterial({ color: ag.a.color, dashSize: 0.14, gapSize: 0.14, transparent: true, opacity: S.built ? 0.22 : 0, toneMapped: false }));
  line.computeLineDistances(); groupOf(ag.a.floorId).add(line);
  ag.beam = { curve, line };
}
export function removeAgent(ag) {
  ag.robot.parent?.remove(ag.robot); ag.tag.remove();
  if (ag.beam) ag.beam.line.parent?.remove(ag.beam.line);
  const i = S.hitMeshes.indexOf(ag.parts.hit); if (i >= 0) S.hitMeshes.splice(i, 1);
  S.agents.splice(S.agents.indexOf(ag), 1);
  ag.robot.traverse(o => o.geometry?.dispose());
}

/* ------------------------------------------------------------------ walking */
const robotXZ = ag => ({ x: ag.robot.position.x, z: ag.robot.position.z });
const seatDest = ag => ({ ...ag.seat, floor: ag.a.floorId, sit: true, kind: 'seat' });

/** Walk to dest {floor, x, z, face, sit, kind, until}. Resolves true on arrival, false if replaced by another walk. */
export function walkTo(ag, dest, speed = 1.5) {
  const mv = ag.mv;
  const prev = mv.waiters; mv.waiters = []; prev.forEach(r => r(false));
  return new Promise(res => {
    mv.dest = dest; mv.waiters.push(res); mv.speed = speed; mv.waitT = 0;
    mv.legs = dest.floor !== ag.curFloor
      ? [{ floor: ag.curFloor, ...elevatorOf(ag.curFloor), elev: dest.floor }, { floor: dest.floor, x: dest.x, z: dest.z }]
      : [{ floor: dest.floor, x: dest.x, z: dest.z }];
    if (mv.state === 'desk' || mv.state === 'away') { mv.state = 'stand'; mv.t0 = now(); }
    else if (mv.state === 'walk') startLeg(ag);
    emit('agents-changed');
  });
}
function startLeg(ag, extra) {
  const mv = ag.mv, leg = mv.legs[0];
  if (!leg) return arrive(ag);
  mv.path = findPath(leg.floor, robotXZ(ag), leg, extra) || [{ x: leg.x, z: leg.z }];
  mv.state = 'walk';
}
function legDone(ag) {
  const mv = ag.mv, leg = mv.legs.shift();
  if (leg?.elev) return rideElevator(ag, leg.elev);
  if (mv.legs.length) startLeg(ag); else arrive(ag);
}
function rideElevator(ag, toFloor) {
  const mv = ag.mv; mv.state = 'elev';
  showBubble(ag, 'إلى طابق آخر', 1400);
  gsap.to(ag.robot.scale, { x: 0.05, y: 0.05, z: 0.05, duration: D(0.45), ease: 'back.in(2)', onComplete: () => {
    const e = elevatorOf(toFloor);
    groupOf(toFloor).add(ag.robot); ag.curFloor = toFloor;
    ag.robot.position.set(e.x, 0, e.z); ag.robot.rotation.y = e.face + Math.PI;
    setTimeout(() => gsap.to(ag.robot.scale, { x: 1, y: 1, z: 1, duration: D(0.45), ease: 'back.out(2)', onComplete: () => startLeg(ag) }), 700);
  } });
}
function arrive(ag) {
  const mv = ag.mv, d = mv.dest || seatDest(ag);
  mv.face = d.face ?? ag.robot.rotation.y; mv.sitting = !!d.sit; mv.kind = d.kind;
  if (d.kind === 'seat') {
    mv.state = 'desk'; ag.robot.position.set(ag.seat.x, 0, ag.seat.z); ag.robot.rotation.y = ag.seat.face;
    ag.workUntil = now() + rand(25, 55);
  } else { mv.state = 'away'; mv.until = d.until ?? Infinity; }
  const ws = mv.waiters; mv.waiters = []; ws.forEach(r => r(true));
  emit('agents-changed');
}

/** Back to the desk; resolves once seated. */
export function goHome(ag, fast = false) {
  if (atDesk(ag)) return Promise.resolve(true);
  if (ag.mv.dest?.kind === 'seat' && ag.mv.state !== 'away') { if (fast) ag.mv.speed = 2.6; return new Promise(r => ag.mv.waiters.push(r)); }
  if (fast) showBubble(ag, isFemale(ag.a) ? 'قادمة!' : 'قادم!', 1800);
  return walkTo(ag, seatDest(ag), fast ? 2.6 : 1.5);
}
export async function goWork(ag) { while (!atDesk(ag) && S.agents.includes(ag)) await goHome(ag, true); }

const taken = spot => S.agents.some(o => o.mv.state !== 'desk' && o.mv.dest?.obj === spot.obj && o.mv.dest?.idx === spot.idx);
/** Take a break somewhere on the agent's floor; tired agents prefer the sofa or coffee. */
export function goBreak(ag) {
  if (!atDesk(ag) || S.meeting.running || S.focused === ag || ag.task) return;
  const tired = ag.energy < 35;
  const kinds = tired ? ['sofa', 'coffee', 'cooler'] : ['cooler', 'coffee', 'sofa', 'plant', 'screen', 'shelf', 'core'];
  const spots = spotsOn(ag.a.floorId, kinds).filter(s => !taken(s));
  const hosts = S.agents.filter(o => o !== ag && atDesk(o) && o.a.floorId === ag.a.floorId && !S.agents.some(v => v.mv.dest?.host === o));
  const f = isFemale(ag.a);
  let dest;
  if (!tired && hosts.length && Math.random() < 0.18) {
    const h = pick(hosts);
    dest = { ...officeDoorOut(h.rec.obj), floor: h.a.floorId, kind: 'visit', host: h, text: f ? `تزور ${h.a.name}` : `يزور ${h.a.name}`, gain: 1.5 };
  } else if (spots.length) {
    const pref = tired ? spots.filter(s => s.kind === 'sofa' || s.kind === 'coffee') : spots;
    const s = pick(pref.length ? pref : spots), c = Object.values(CATALOG).find(x => x.kind === s.kind);
    dest = { ...s, floor: ag.a.floorId, text: f ? c.f : c.m, gain: c.gain || 2 };
  } else return;
  dest.until = Infinity;
  showBubble(ag, tired ? (f ? 'تعبت، سأرتاح قليلاً' : 'تعبت، سأرتاح قليلاً') : (f ? 'أنهت مهمتها' : 'أنهى مهمته'), 2000);
  walkTo(ag, dest).then(ok => {
    if (!ok) return;
    ag.mv.until = now() + Math.max(6, Math.min(18, (92 - ag.energy) / (dest.gain || 2)));
    showBubble(ag, dest.text, 4500);
    const h = dest.host; if (h) setTimeout(() => { if (S.agents.includes(h)) { showBubble(h, `أهلاً ${ag.a.name}!`, 2600); h.kick = 1; } }, 1300);
  });
}
/** Walk to a colleague's door (hand-offs). Resolves on arrival; call goHome() afterwards. */
export async function goVisit(ag, host, text, direct = false) {
  if (!direct) await goWork(ag); // hand-offs start from the desk; the CEO's rounds go door to door
  if (text) showBubble(ag, text, 3000);
  return walkTo(ag, { ...officeDoorOut(host.rec.obj), floor: host.a.floorId, kind: 'errand', until: Infinity }, 1.9);
}

export function statusText(ag) {
  const f = isFemale(ag.a), k = ag.mv.dest?.kind;
  if (!atDesk(ag)) {
    if (k === 'errand') return f ? 'تسلّم عملاً لزميل' : 'يسلّم عملاً لزميل';
    if (k === 'table') return 'في الاجتماع';
    if (k === 'seat') return f ? 'عائدة إلى مكتبها' : 'عائد إلى مكتبه';
    return 'في استراحة';
  }
  if (ag.task) return f ? 'تعمل على مهمة' : 'يعمل على مهمة';
  return ag.a.working ? 'متصل' : 'خامل';
}
export const onBreakCount = floorId => S.agents.filter(o => o.mv.state !== 'desk' && o.a.floorId === floorId && !o.task).length;

/* ------------------------------------------------------------------ energy and mood */
export function moodOf(ag) {
  const score = ag.energy * 0.7 + 30 + ag.moodBoost;
  if (score >= 85) return { label: 'متحمس', color: '#34e08a' };
  if (score >= 65) return { label: 'مرتاح', color: '#7dd3fc' };
  if (score >= 45) return { label: 'متعب', color: '#ffc53d' };
  return { label: 'مرهق', color: '#ff6b6b' };
}
export const nudgeMood = (ag, v) => { ag.moodBoost = Math.max(-30, Math.min(30, ag.moodBoost + v)); };

export function showBubble(ag, text, ms = 3200) {
  ag.bubble.textContent = text; ag.bubble.classList.add('on');
  clearTimeout(ag.bubbleTimer); ag.bubbleTimer = setTimeout(() => ag.bubble.classList.remove('on'), ms);
}
const GREET = {
  morning: [['صباح الخير!', 'صباح النور!'], ['يوم موفق!', 'ولك كذلك!'], ['جاهز للاجتماع؟', 'بعد القهوة!']],
  day: [['كيف الشغل؟', 'ماشي تمام!'], ['تحتاج مساعدة؟', 'شكراً، أنا بخير'], ['أنهيت التقرير؟', 'تقريباً!']],
  evening: [['مساء الخير!', 'مساء النور!'], ['يوم طويل!', 'نعم، قاربنا'], ['استراحة قهوة؟', 'فكرة ممتازة']],
  night: [['ما زلت هنا؟', 'المهام لا تنام!'], ['تصبح على خير', 'وأنت من أهله'], ['آخر مهمة', 'بالتوفيق!']],
};

/* ------------------------------------------------------------------ per-frame */
const tmp = new THREE.Vector3();
const ease = (obj, v, dt, r = 10) => { obj.rotation.x += (v - obj.rotation.x) * Math.min(1, dt * r); };
function turnTo(r, target, dt, rate = 9) { const d = Math.atan2(Math.sin(target - r.rotation.y), Math.cos(target - r.rotation.y)); r.rotation.y += d * Math.min(1, dt * rate); return Math.abs(d); }

function stepWalk(ag, dt) {
  const mv = ag.mv, r = ag.robot, target = mv.path[0];
  if (!target) return legDone(ag);
  const dx = target.x - r.position.x, dz = target.z - r.position.z, d = Math.hypot(dx, dz);
  const heading = Math.atan2(dx, dz);
  const off = turnTo(r, heading, dt);
  // keep a polite distance from anyone standing or walking ahead
  const blocker = S.agents.find(o => o !== ag && o.curFloor === ag.curFloor && o.mv.state !== 'desk' && o.mv.state !== 'elev'
    && Math.hypot(o.robot.position.x - r.position.x, o.robot.position.z - r.position.z) < 0.62
    && ((o.robot.position.x - r.position.x) * dx + (o.robot.position.z - r.position.z) * dz) / (d || 1) > 0.08);
  if (blocker) {
    mv.waitT += dt;
    if (mv.waitT > 0.7 && mv.waitT < 3) {
      const p = findPath(mv.legs[0].floor, { x: r.position.x, z: r.position.z }, mv.legs[0], [{ x: blocker.robot.position.x, z: blocker.robot.position.z, r: 0.55 }]);
      if (p) { mv.path = p; mv.waitT = 3; }
    }
    if (mv.waitT < 3.6) return;
  } else if (mv.waitT > 0) mv.waitT = Math.max(0, mv.waitT - dt);
  const tiredF = ag.energy < 25 ? 0.75 : 1;
  const step = mv.speed * tiredF * Math.max(0.3, Math.cos(Math.min(off, 1.4))) * dt;
  if (d <= step) { r.position.x = target.x; r.position.z = target.z; mv.path.shift(); if (!mv.path.length) legDone(ag); }
  else { r.position.x += dx / d * step; r.position.z += dz / d * step; }
  mv.phase += step * 5.5;
}

function maybeGreet(ag, t) {
  if (ag.mv.state !== 'walk' || t - ag.lastChat < 25) return;
  const other = S.agents.find(o => o !== ag && o.curFloor === ag.curFloor && (o.mv.state === 'walk' || o.mv.state === 'away') && t - o.lastChat > 25
    && Math.hypot(o.robot.position.x - ag.robot.position.x, o.robot.position.z - ag.robot.position.z) < 1.3);
  if (!other) return;
  ag.lastChat = other.lastChat = t;
  if (Math.random() < 0.4) return;
  const [q, a] = pick(GREET[dayPart()] || GREET.day);
  showBubble(ag, q, 2200); setTimeout(() => S.agents.includes(other) && showBubble(other, a, 2200), 1100);
}

onFrame((dt, t) => {
  const T = now(), night = dayPart() === 'night' ? 1.3 : 1;
  S.agents.forEach((o, k) => {
    const mv = o.mv, desk = mv.state === 'desk', w = (o.a.working || !!o.task) && desk;
    if (mv.state === 'stand') { mv.sitting = false; if (T - mv.t0 > 0.4) startLeg(o); }
    else if (mv.state === 'walk') { stepWalk(o, dt); maybeGreet(o, T); }
    else if (mv.state === 'away') { turnTo(o.robot, mv.face, dt, 6); if (T > mv.until) goHome(o); }

    // energy: work drains it, breaks restore it
    if (desk) o.energy -= dt * (o.task ? 0.5 : w ? 0.16 : 0.04) * night;
    else if (mv.state === 'away' && mv.dest?.gain) o.energy += dt * mv.dest.gain;
    else if (mv.state === 'walk') o.energy -= dt * 0.05;
    o.energy = Math.max(0, Math.min(100, o.energy));
    o.moodBoost *= 1 - dt * 0.01;

    // body animation
    const tired = o.energy < 25;
    if (mv.state === 'walk') {
      const sw = Math.sin(mv.phase);
      o.legs[0].rotation.x = sw * 0.6; o.legs[1].rotation.x = -sw * 0.6;
      o.arms[0].rotation.x = -sw * 0.5; o.arms[1].rotation.x = sw * 0.5;
      o.headPivot.rotation.y *= 0.9; ease(o.headPivot, tired ? 0.25 : 0.05, dt);
      o.cup.visible = false;
    } else {
      o.legs.forEach(l => ease(l, mv.sitting === false ? 0 : -SIT, dt, 8));
      if (desk && o.stretchT <= 0 && !o.task && o.energy < 70 && Math.random() < dt * 0.02) { o.stretchT = 1.8; showBubble(o, isFemale(o.a) ? 'تتمطّى' : 'يتمطّى', 1600); }
      if (o.stretchT > 0) {
        o.stretchT -= dt;
        ease(o.arms[0], -2.9, dt, 6); ease(o.arms[1], -2.9, dt, 6); ease(o.headPivot, -0.3, dt, 6);
      } else if (w) {
        o.arms[0].rotation.x = -1.15 + Math.sin(t * 16 + k) * 0.13;
        o.arms[1].rotation.x = -1.15 + Math.sin(t * 16 + k + 2.4) * 0.13;
        o.headPivot.rotation.y = Math.sin(t * 0.6 + k) * 0.18;
        o.headPivot.rotation.x = (tired ? 0.3 : 0.12) + Math.sin(t * 1.3 + k) * 0.04;
        o.parts.tex.offset.y -= dt * 0.18;
      } else if (mv.state === 'away') {
        const drink = !!mv.dest?.drink || mv.dest?.kind === 'coffee' || mv.dest?.kind === 'cooler';
        const sip = drink && Math.sin(t * 1.1 + k) > 0.35;
        o.cup.visible = drink;
        if (mv.dest?.kind === 'table') { ease(o.arms[0], -1.0, dt, 6); ease(o.arms[1], -1.0, dt, 6); o.headPivot.rotation.y = S.speaker ? Math.sin(t * 0.8 + k) * 0.4 : 0; }
        else { ease(o.arms[0], -0.1 + Math.sin(t * 1.5 + k) * 0.05, dt, 6); ease(o.arms[1], sip ? -2.3 : -0.25, dt, 6);
          o.headPivot.rotation.y = mv.dest?.host ? Math.sin(t * 2) * 0.1 : Math.sin(t * 0.5 + k) * 0.5; }
        ease(o.headPivot, sip ? -0.25 : tired ? 0.25 : 0, dt, 6);
      } else {
        ease(o.arms[0], -0.15, dt, 6); ease(o.arms[1], -0.15, dt, 6);
        o.headPivot.rotation.y = Math.sin(t * 0.4 + k) * 0.6;
        ease(o.headPivot, tired ? 0.3 : -0.1, dt, 6);
      }
      if (desk) o.cup.visible = false;
    }
    if (o.kick > 0) o.kick = Math.max(0, o.kick - dt * 1.6);
    const seatLift = mv.state === 'away' && mv.sitting ? 0.07 : 0;
    const bob = mv.state === 'walk' ? Math.abs(Math.sin(mv.phase)) * 0.06 : Math.sin(t * 2 + k) * 0.02;
    o.robot.position.y = seatLift + bob + Math.sin(o.kick * Math.PI) * 0.35;
    const blink = (t > o.blinkAt && t < o.blinkAt + 0.12) ? 0.15 : 1;
    if (t > o.blinkAt + 0.12) o.blinkAt = t + rand(2, 6);
    o.eyes.forEach(e => { e.scale.y = blink; });
    o.antennas.forEach(a => { a.material.opacity = (tired ? 0.3 : 0.6) + 0.4 * Math.sin(t * 3 + k); });

    // office ring and screen
    const P = o.parts;
    const lvl = (w ? 0.6 : 0.3) * (desk ? 1 : 0.55) + 0.15 * Math.sin(t * 2 + k) + o.selA * 0.5 + o.boost;
    P.outer.material.opacity = Math.min(lvl, 1.6);
    P.disc.material.opacity = 0.05 + o.selA * 0.08 + o.boost * 0.15;
    P.inner.rotation.z += dt * (0.4 + o.boost * 3);
    if (P.ring.scale.x > 0.999 && S.built) P.ring.scale.x = P.ring.scale.y = 1 + o.boost * 0.08 + o.selA * 0.04;
    P.screenLight.visible = !S.lowLights;
    P.screenLight.intensity = w ? 1.2 + Math.sin(t * 9 + k) * 0.2 : 0.4;

    // label above the head (only on the floor being viewed)
    const onView = o.curFloor === S.viewFloor;
    if (!onView) { o.tag.style.opacity = 0; return; }
    tmp.set(0, 2.6, 0); o.robot.localToWorld(tmp); tmp.y = 2.6 + o.robot.position.y; tmp.project(camera);
    if (!o.tagW || (o._wt = (o._wt || 0) + 1) % 30 === 0) o.tagW = o.tag.offsetWidth || 80; // measuring every frame is slow
    const hw = o.tagW / 2 + 8;
    const sx = Math.min(innerWidth - hw, Math.max(hw, (tmp.x * 0.5 + 0.5) * innerWidth)), sy = (-tmp.y * 0.5 + 0.5) * innerHeight;
    if (o.progress >= 0) { o.prog.classList.add('on'); o.prog.firstChild.style.width = Math.round(o.progress * 100) + '%'; } else o.prog.classList.remove('on');
    o.tag.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
    const lead = S.speaker || S.focused;
    o.tag.style.opacity = S.built || o.robot.scale.x > 0.99 ? (o.dim ? 0.2 : !lead || lead === o ? 1 : 0.35) : 0;
    if (o.holo?.mesh.visible && o.holo.mesh.material.opacity > 0.4) o.tag.style.opacity = 0; // the live screen shows name and progress
  });
});
export { sendPulse };
