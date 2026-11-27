// The office as data: every office and piece of furniture is an object {id, type, x, z, rot, ...} on a floor.
// This module knows how to draw each type, where it blocks walking, and where agents can stand or sit.
import { THREE, std, glow, mesh, screenTexture, deskMat, legMat, RoundedBoxGeometry } from './scene.js';
import { ROOM_H } from './data.js';

export const rotAngle = rot => (rot || 0) * Math.PI / 2;
/** object-local (lx, lz) -> floor coordinates */
export function toFloor(o, lx, lz) {
  const t = rotAngle(o.rot), c = Math.cos(t), s = Math.sin(t);
  return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c };
}
/** facing angle for a local direction (lx, lz) */
export const faceOf = (o, lx, lz) => Math.atan2(lx, lz) + rotAngle(o.rot);

const glassMat = new THREE.MeshStandardMaterial({ color: '#a9c1ff', transparent: true, opacity: 0.13, roughness: 0.1, metalness: 0.2, depthWrite: false });
const postMat = std('#2a3566', { metalness: 0.6, roughness: 0.35 });
export const lampMats = []; // desk-lamp bulbs, brightened at night by the day cycle

/* ------------------------------------------------------------------ catalog */
// rect = [x1, z1, x2, z2] in object-local units; spots = [x, z, lookX, lookZ, sit]
export const CATALOG = {
  office: { label: 'مكتب', w: 3.6, d: 3.5 },
  plant: { label: 'نبتة', w: 1.0, d: 1.0, rects: [[-0.45, -0.45, 0.45, 0.45]], spots: [[0, 0.85, 0, 0]], kind: 'plant', m: 'يسقي النبتة', f: 'تسقي النبتة', gain: 2, drink: true },
  cooler: { label: 'برّادة ماء', w: 0.8, d: 0.8, rects: [[-0.3, -0.25, 0.3, 0.25]], spots: [[0, 0.75, 0, 0]], kind: 'cooler', m: 'يشرب ماء', f: 'تشرب ماء', gain: 3, drink: true },
  coffee: { label: 'ركن القهوة', w: 1.8, d: 1.0, rects: [[-0.8, -0.4, 0.8, 0.4]], spots: [[-0.45, 0.9, -0.45, 0], [0.45, 0.9, 0.45, 0]], kind: 'coffee', m: 'يشرب قهوة', f: 'تشرب قهوة', gain: 4, drink: true },
  sofa: { label: 'كنبة', w: 3.9, d: 1.2, rects: [[-1.9, -0.55, 1.9, 0.45]], spots: [[-0.8, 0.12, -0.8, 5, 1], [0.8, 0.12, 0.8, 5, 1]], kind: 'sofa', m: 'يستريح قليلاً', f: 'تستريح قليلاً', gain: 5 },
  screen: { label: 'شاشة', w: 1.8, d: 0.6, rects: [[-0.8, -0.15, 0.8, 0.15]], spots: [[-0.4, 1.0, -0.4, 0], [0.4, 1.0, 0.4, 0]], kind: 'screen', m: 'يتابع الشاشة', f: 'تتابع الشاشة', gain: 2 },
  shelf: { label: 'مكتبة كتب', w: 2.0, d: 0.7, rects: [[-0.9, -0.25, 0.9, 0.25]], spots: [[0, 0.8, 0, 0]], kind: 'shelf', m: 'يتصفح كتاباً', f: 'تتصفح كتاباً', gain: 2.5 },
  table: { label: 'طاولة اجتماعات', w: 3.0, d: 3.0, rects: [[-1.3, -0.6, 1.3, 0.6]],
    spots: [[-0.8, -1.0, -0.8, 0, 1], [0, -1.0, 0, 0, 1], [0.8, -1.0, 0.8, 0, 1], [-0.8, 1.0, -0.8, 0, 1], [0, 1.0, 0, 0, 1], [0.8, 1.0, 0.8, 0, 1]],
    kind: 'table', m: 'في الاجتماع', f: 'في الاجتماع', gain: 0 },
  elevator: { label: 'مصعد', w: 1.8, d: 0.9, rects: [[-0.8, -0.4, 0.8, 0.4]], spots: [[0, 0.9, 0, 0]], kind: 'elevator', fixed: true },
  core: { label: 'الخلية', w: 2.8, d: 2.8, rects: [[-1.25, -1.25, 1.25, 1.25]], spots: [[-1.9, -0.35, 0, 0], [-1.9, 0.35, 0, 0]], kind: 'core', m: 'يراقب الخلية', f: 'تراقب الخلية', gain: 2, unique: true },
};
export const PLACEABLE = ['office', 'plant', 'sofa', 'screen', 'shelf', 'cooler', 'coffee', 'table'];

/* ------------------------------------------------------------------ office geometry (room-local) */
export const OFFICE = { HW: 1.75, ZB: -1.7, ZF: 1.7, DOOR: 0.55, SEAT: [0, -0.5], DESK_Z: 0.45 };
/** walls + desk as rects, door gap on side o.door (1 = local +x) */
function officeRects(o) {
  const { HW, ZB, ZF, DOOR } = OFFICE, s = o.door || 1, t = 0.03;
  return [
    [-HW, ZB - t, HW, ZB + t], [-HW, ZF - t, HW, ZF + t],
    norm([-s * HW - t, ZB, -s * HW + t, ZF]),
    norm([s * HW - t, ZB, s * HW + t, -DOOR]), norm([s * HW - t, DOOR, s * HW + t, ZF]),
  ];
}
const norm = ([a, b, c, d]) => [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
const DESK_RECT = [-1.25, OFFICE.DESK_Z - 0.6, 1.25, OFFICE.DESK_Z + 0.6];

/** Obstacles in floor coordinates: [{x1,z1,x2,z2,pad}] (axis-aligned because rotations are 90° steps). */
export function obstacles(o) {
  const out = [];
  const add = (r, pad) => {
    const a = toFloor(o, r[0], r[1]), b = toFloor(o, r[2], r[3]);
    out.push({ x1: Math.min(a.x, b.x), z1: Math.min(a.z, b.z), x2: Math.max(a.x, b.x), z2: Math.max(a.z, b.z), pad });
  };
  if (o.type === 'office') { officeRects(o).forEach(r => add(r, 0.15)); add(DESK_RECT, 0.1); }
  else (CATALOG[o.type]?.rects || []).forEach(r => add(r, 0.2));
  return out;
}
/** Editor footprint in floor coordinates. */
export function footprint(o) {
  const c = CATALOG[o.type]; const a = toFloor(o, -c.w / 2, -c.d / 2), b = toFloor(o, c.w / 2, c.d / 2);
  return { x1: Math.min(a.x, b.x), z1: Math.min(a.z, b.z), x2: Math.max(a.x, b.x), z2: Math.max(a.z, b.z) };
}
/** Places an agent can go to at this object: [{x, z, face, sit, kind, idx}] */
export function spotsOf(o) {
  const c = CATALOG[o.type]; if (!c?.spots) return [];
  return c.spots.map(([lx, lz, ax, az, sit], idx) => {
    const p = toFloor(o, lx, lz), q = toFloor(o, ax, az);
    return { x: p.x, z: p.z, face: Math.atan2(q.x - p.x, q.z - p.z), sit: !!sit, kind: c.kind, idx, obj: o };
  });
}
export const officeSeat = o => { const p = toFloor(o, ...OFFICE.SEAT); return { x: p.x, z: p.z, face: rotAngle(o.rot) }; };
export const officeDoorOut = o => { const s = o.door || 1; const p = toFloor(o, s * 2.1, 0); const q = officeSeat(o); return { x: p.x, z: p.z, face: Math.atan2(q.x - p.x, q.z - p.z) }; };

/* ------------------------------------------------------------------ drawing */
/** Draws an object into a new group positioned on the floor; returns {group, parts}. */
export function drawObject(o, color = '#94a3b8') {
  const g = new THREE.Group(); g.position.set(o.x, 0, o.z); g.rotation.y = rotAngle(o.rot);
  const parts = {};
  ({ office: drawOffice, plant: drawPlant, cooler: drawCooler, coffee: drawCoffee, sofa: drawSofa, screen: drawScreen,
    shelf: drawShelf, table: drawTable, elevator: drawElevator, core: () => {} })[o.type]?.(g, o, color, parts);
  return { group: g, parts };
}

function drawOffice(g, o, color, P) {
  const col = new THREE.Color(color);
  const { HW, ZB, ZF, DOOR } = OFFICE, side = o.door || 1;
  const room = new THREE.Group(); g.add(room); P.room = room;
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 3.4), new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.18).add(new THREE.Color('#0b1332')), roughness: 0.95 }));
  carpet.rotation.x = -Math.PI / 2; carpet.position.y = 0.008; carpet.receiveShadow = true; room.add(carpet);
  const railMat = glow(color, 0.85); P.railMat = railMat;
  const seg = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1), alongZ = Math.abs(z2 - z1) > Math.abs(x2 - x1);
    const w = new THREE.Mesh(new THREE.BoxGeometry(len, ROOM_H, 0.05), glassMat);
    w.position.set((x1 + x2) / 2, ROOM_H / 2, (z1 + z2) / 2); if (alongZ) w.rotation.y = Math.PI / 2; room.add(w);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len + 0.06, 0.05, 0.08), railMat);
    rail.position.set((x1 + x2) / 2, ROOM_H, (z1 + z2) / 2); if (alongZ) rail.rotation.y = Math.PI / 2; room.add(rail);
    [[x1, z1], [x2, z2]].forEach(([px, pz]) => mesh(new THREE.BoxGeometry(0.07, ROOM_H, 0.07), postMat, px, ROOM_H / 2, pz, room));
  };
  seg(-HW, ZB, HW, ZB); seg(-HW, ZF, HW, ZF); seg(-side * HW, ZB, -side * HW, ZF);
  seg(side * HW, ZB, side * HW, -DOOR); seg(side * HW, DOOR, side * HW, ZF);

  const desk = new THREE.Group(); desk.position.z = OFFICE.DESK_Z; g.add(desk); P.desk = desk;
  mesh(new RoundedBoxGeometry(2.5, 0.1, 1.2, 2, 0.04), deskMat, 0, 0.8, 0, desk);
  [[-1.15, -0.5], [1.15, -0.5], [-1.15, 0.5], [1.15, 0.5]].forEach(([lx, lz]) => mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), legMat, lx, 0.4, lz, desk));
  mesh(new THREE.BoxGeometry(0.8, 0.035, 0.55), std('#cfd6f5', { metalness: 0.5, roughness: 0.3 }), 0, 0.87, -0.05, desk);
  const lid = new THREE.Group(); lid.position.set(0, 0.885, 0.22); lid.rotation.set(-0.22, Math.PI, 0); desk.add(lid);
  P.tex = screenTexture(color);
  mesh(new THREE.PlaneGeometry(0.74, 0.48), new THREE.MeshBasicMaterial({ map: P.tex, toneMapped: false }), 0, 0.26, 0.012, lid);
  mesh(new THREE.BoxGeometry(0.8, 0.52, 0.02), std('#cfd6f5', { metalness: 0.5, roughness: 0.3, emissive: col, emissiveIntensity: 0.08 }), 0, 0.26, 0, lid);
  mesh(new THREE.CircleGeometry(0.05, 20), glow(color), 0, 0.28, -0.012, lid).rotation.y = Math.PI;
  P.screenLight = new THREE.PointLight(color, 1.2, 2.2, 2); P.screenLight.position.set(0, 1.25, -0.4); desk.add(P.screenLight);
  mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.16, 16), std('#e8ecff'), 0.85, 0.93, 0.25, desk);
  // desk lamp: glows at night
  mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.03, 16), legMat, -0.95, 0.865, 0.25, desk);
  mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 6), legMat, -0.95, 1.05, 0.25, desk);
  const bulb = mesh(new THREE.SphereGeometry(0.07, 12, 10), glow('#ffd9a0', 0), -0.95, 1.25, 0.18, desk);
  bulb.castShadow = false; lampMats.push(bulb.material); P.bulb = bulb.material;

  const chair = new THREE.Group(); chair.position.set(0, 0, OFFICE.SEAT[1]); g.add(chair);
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 10), legMat, 0, 0.21, 0, chair);
  mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 20), legMat, 0, 0.02, 0, chair);
  mesh(new RoundedBoxGeometry(0.85, 0.12, 0.8, 2, 0.05), std('#202a58'), 0, 0.48, 0, chair);

  const ring = new THREE.Group(); ring.position.y = 0.02; ring.rotation.x = -Math.PI / 2; g.add(ring); P.ring = ring;
  P.disc = new THREE.Mesh(new THREE.CircleGeometry(1.45, 64), glow(color, 0.07)); ring.add(P.disc);
  P.outer = new THREE.Mesh(new THREE.RingGeometry(1.34, 1.45, 96), glow(color, 0.9)); ring.add(P.outer);
  P.inner = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.09, 96, 1, 0, Math.PI * 1.4), glow(color, 0.45)); ring.add(P.inner);

  P.hit = new THREE.Mesh(new THREE.BoxGeometry(3.3, 2.8, 3.3), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  P.hit.position.y = 1.4; g.add(P.hit);
  P.anim = [[room, 'rise'], [desk, 'drop'], [ring, 'ring']];
}
function drawPlant(g, o, c, P) {
  mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.7, 24), std('#e8ecff'), 0, 0.35, 0, g);
  const leaf = std('#33c07a', { roughness: 0.5 });
  [[0, 1.3, 0, .6], [.35, 1.9, .1, .45], [-.3, 1.8, -.1, .5], [.05, 2.4, 0, .4], [-.15, 1.0, .3, .35]].forEach(([x, y, z, r]) => mesh(new THREE.SphereGeometry(r, 20, 16), leaf, x, y, z, g));
}
function drawCooler(g) {
  mesh(new THREE.BoxGeometry(0.5, 0.9, 0.45), std('#e8ecff'), 0, 0.45, 0, g);
  mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 20), new THREE.MeshStandardMaterial({ color: '#5cc8ff', transparent: true, opacity: 0.75, roughness: 0.1, emissive: '#2a8fd6', emissiveIntensity: 0.4 }), 0, 1.15, 0, g);
}
function drawCoffee(g) {
  mesh(new RoundedBoxGeometry(1.6, 0.95, 0.8, 2, 0.05), std('#1b2550'), 0, 0.475, 0, g);
  mesh(new RoundedBoxGeometry(0.45, 0.55, 0.45, 2, 0.06), std('#cfd6f5', { metalness: 0.5, roughness: 0.3 }), -0.3, 1.23, -0.05, g);
  mesh(new THREE.CircleGeometry(0.07, 16), glow('#ff8a3d'), -0.3, 1.35, 0.18, g);
  mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.13, 14), std('#e8ecff'), 0.35, 1.02, 0.1, g);
  mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.13, 14), std('#ffc53d'), 0.55, 1.02, -0.1, g);
}
function drawSofa(g) {
  const blue = std('#2547d6', { roughness: 0.75 });
  mesh(new RoundedBoxGeometry(3.2, 0.5, 1.1, 3, 0.12), blue, 0, 0.35, 0, g);
  mesh(new RoundedBoxGeometry(3.2, 0.9, 0.3, 3, 0.12), blue, 0, 0.8, -0.42, g);
  mesh(new RoundedBoxGeometry(0.3, 0.75, 1.1, 3, 0.12), blue, -1.6, 0.5, 0, g);
  mesh(new RoundedBoxGeometry(0.3, 0.75, 1.1, 3, 0.12), blue, 1.6, 0.5, 0, g);
}
function chartTexture() {
  const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d');
  x.fillStyle = '#081028'; x.fillRect(0, 0, 320, 180);
  ['#3d6bff', '#2fe08a', '#ff8a3d', '#b06bff', '#ffc53d', '#ff5c8a'].forEach((col, i) => { const h = 30 + Math.random() * 110; x.fillStyle = col; x.fillRect(22 + i * 48, 160 - h, 30, h); });
  x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 3; x.beginPath();
  for (let i = 0; i < 8; i++) x.lineTo(10 + i * 43, 80 - Math.sin(i * 0.9) * 35); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function drawScreen(g) {
  mesh(new THREE.BoxGeometry(0.5, 0.05, 0.4), legMat, 0, 0.025, 0, g);
  mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), legMat, 0, 0.6, 0, g);
  mesh(new THREE.BoxGeometry(1.6, 0.95, 0.07), std('#0c1230', { metalness: 0.5 }), 0, 1.55, 0, g);
  mesh(new THREE.PlaneGeometry(1.5, 0.85), new THREE.MeshBasicMaterial({ map: chartTexture(), toneMapped: false }), 0, 1.55, 0.04, g);
}
function drawShelf(g) {
  const wood = std('#2a3566', { roughness: 0.8 });
  mesh(new THREE.BoxGeometry(1.8, 2.0, 0.45), wood, 0, 1.0, 0, g);
  const cols = ['#ff8a3d', '#4d7cff', '#2fe08a', '#b06bff', '#ffc53d', '#ff5c8a', '#e8ecff'];
  for (let r = 0; r < 4; r++) for (let k = 0; k < 9; k++) {
    if (Math.random() < 0.2) continue;
    const h = 0.28 + Math.random() * 0.12;
    mesh(new THREE.BoxGeometry(0.13, h, 0.3), std(cols[(r * 9 + k) % cols.length]), -0.72 + k * 0.18, 0.12 + r * 0.48 + h / 2, 0.1, g);
  }
}
function drawTable(g) {
  mesh(new RoundedBoxGeometry(2.6, 0.08, 1.2, 2, 0.04), std('#e8ecff', { roughness: 0.35 }), 0, 0.78, 0, g);
  mesh(new THREE.BoxGeometry(0.2, 0.75, 0.6), legMat, -0.9, 0.38, 0, g);
  mesh(new THREE.BoxGeometry(0.2, 0.75, 0.6), legMat, 0.9, 0.38, 0, g);
  mesh(new THREE.PlaneGeometry(1.6, 0.5), glow('#9d7bff', 0.35), 0, 0.83, 0, g).rotation.x = -Math.PI / 2;
  [-0.8, 0, 0.8].forEach(x => [-1, 1].forEach(s => {
    const ch = new THREE.Group(); ch.position.set(x, 0, s * 1.0); g.add(ch);
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 10), legMat, 0, 0.21, 0, ch);
    mesh(new RoundedBoxGeometry(0.6, 0.1, 0.55, 2, 0.04), std('#202a58'), 0, 0.48, 0, ch);
    mesh(new RoundedBoxGeometry(0.6, 0.5, 0.08, 2, 0.03), std('#202a58'), 0, 0.78, s * 0.27, ch);
  }));
}
function drawElevator(g) {
  mesh(new THREE.BoxGeometry(1.7, 2.6, 0.5), std('#141d45', { metalness: 0.6, roughness: 0.3 }), 0, 1.3, -0.1, g);
  mesh(new THREE.BoxGeometry(0.62, 2.1, 0.04), std('#cfd6f5', { metalness: 0.8, roughness: 0.2 }), -0.32, 1.06, 0.17, g);
  mesh(new THREE.BoxGeometry(0.62, 2.1, 0.04), std('#cfd6f5', { metalness: 0.8, roughness: 0.2 }), 0.32, 1.06, 0.17, g);
  mesh(new THREE.BoxGeometry(1.4, 0.05, 0.06), glow('#3d6bff', 0.9), 0, 2.2, 0.18, g);
  mesh(new THREE.CircleGeometry(0.07, 16), glow('#2fe08a', 1), 0.7, 1.2, 0.17, g);
}

/* ------------------------------------------------------------------ default main floor (matches the earlier fixed office) */
export function defaultMainObjects() {
  const off = [[-5.2, -5.6, 1, 'mira'], [-0.6, -5.6, -1, 'otto'], [-5.2, -1.6, 1, 'nova'], [-0.6, -1.6, -1, 'sage'], [-5.2, 2.4, 1, 'pip'], [-0.6, 2.4, -1, 'juno']];
  return [
    ...off.map(([x, z, door, agentKey]) => ({ id: 'o_' + agentKey, type: 'office', x, z, rot: 0, door, agentKey })),
    { id: 'cooler1', type: 'cooler', x: -2.9, z: -7.7, rot: 0 },
    { id: 'coffee1', type: 'coffee', x: 7.35, z: 6.4, rot: 3 },
    { id: 'sofa1', type: 'sofa', x: -7.25, z: 6.2, rot: 1 },
    { id: 'plant1', type: 'plant', x: 3.3, z: -7.35, rot: 0 },
    { id: 'table1', type: 'table', x: 1.0, z: 6.3, rot: 0 },
    { id: 'screen1', type: 'screen', x: 4.9, z: 7.45, rot: 2 },
    { id: 'elev', type: 'elevator', x: 7.1, z: -7.5, rot: 0 },
    { id: 'core', type: 'core', x: 5.2, z: -1.3, rot: 0 },
  ];
}
/** A new department floor: elevator, lounge corner and a few empty offices. */
export function defaultDeptObjects(n = 3) {
  const offices = [[-5.2, -5.6, 1], [-0.6, -5.6, -1], [-5.2, -1.6, 1], [-0.6, -1.6, -1], [-5.2, 2.4, 1], [-0.6, 2.4, -1]].slice(0, n);
  return [
    ...offices.map(([x, z, door], i) => ({ id: 'o' + i + Math.random().toString(36).slice(2, 6), type: 'office', x, z, rot: 0, door, agentKey: null })),
    { id: 'elev', type: 'elevator', x: 7.1, z: -7.5, rot: 0 },
    { id: 'cool' + Math.random().toString(36).slice(2, 6), type: 'cooler', x: -2.9, z: -7.7, rot: 0 },
    { id: 'cof' + Math.random().toString(36).slice(2, 6), type: 'coffee', x: 7.35, z: 6.4, rot: 3 },
    { id: 'sofa' + Math.random().toString(36).slice(2, 6), type: 'sofa', x: -7.25, z: 6.2, rot: 1 },
    { id: 'pl' + Math.random().toString(36).slice(2, 6), type: 'plant', x: 3.3, z: -7.35, rot: 0 },
  ];
}
