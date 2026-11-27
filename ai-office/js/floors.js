// Floors: each floor is a group with its own room shell and objects. Only the viewed floor is visible,
// but agents on every floor keep living and working.
import { THREE, world, std, glow, mesh, build, BUILD, tiles, windowPanes, RoundedBoxGeometry, animateIn, setCorePos, setCoreVisible } from './scene.js';
import { S, byKey } from './state.js';
import { drawObject, CATALOG, spotsOf, footprint } from './layout.js';
import { rebuildNav, isFree } from './nav.js';
import { put } from './store.js';
import { emit, gsap } from './util.js';

export const FL = { groups: new Map(), drawn: new Map() }; // drawn: objId -> {floorId, obj, group, parts}
export const floorById = id => S.floors.find(f => f.id === id);
export const mainFloor = () => S.floors[0];
export const objAt = (floorId, id) => floorById(floorId)?.objects.find(o => o.id === id);

function shell(floor, parent) {
  const tint = new THREE.Color(floor.color || '#3d6bff');
  const plate = mesh(new THREE.BoxGeometry(16, 0.4, 16), std(new THREE.Color('#0b1332').lerp(tint, 0.06), { roughness: 0.85 }), 0, -0.2, 0, parent);
  build(plate, 'floor');
  const pts = [];
  for (let i = -8; i <= 8; i += 2) pts.push(i, 0.011, -8, i, 0.011, 8, -8, 0.011, i, 8, 0.011, i);
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: 0.35, toneMapped: false }));
  plate.add(grid); grid.position.y = 0.2;
  plate.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(16, 0.4, 16)), new THREE.LineBasicMaterial({ color: tint.clone().lerp(new THREE.Color('#ffffff'), 0.3), toneMapped: false })));
  for (let i = 0; i < 9; i++) {
    const t = mesh(new THREE.PlaneGeometry(1.9, 1.9), glow(tint, 0), -7 + ((Math.random() * 8) | 0) * 2, 0.012, -7 + ((Math.random() * 8) | 0) * 2, parent);
    t.rotation.x = -Math.PI / 2; t.castShadow = false; t.userData.phase = Math.random() * 10; tiles.push(t);
  }
  const wall = (w, h, d, x, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return build(mesh(g, std('#121b3f', { roughness: 0.9 }), x, 0, z, parent), 'wall'); };
  const back = wall(16.3, 6, 0.3, -0.15, -8.15), left = wall(0.3, 6, 16, -8.15, 0);
  const pane = (p, w, h, x, y, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; p.add(g);
    mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.06), std('#e8ecff', { roughness: 0.4 }), 0, 0, 0, g);
    const glass = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: '#b9d2ff', toneMapped: false }), 0, 0, 0.04, g);
    windowPanes.push(glass.material);
    mesh(new THREE.BoxGeometry(0.05, h, 0.04), std('#e8ecff'), 0, 0, 0.06, g);
  };
  pane(back, 1.3, 3.2, 3.6, 3.3, 0.17, 0); pane(back, 1.3, 3.2, 5.5, 3.3, 0.17, 0);
  pane(left, 1.1, 1.6, 0.17, 3.4, -5.6, Math.PI / 2); pane(left, 1.1, 1.6, 0.17, 3.4, -3.4, Math.PI / 2);
  mesh(new THREE.BoxGeometry(0.9, 1.9, 0.06), std(floor.id === 'main' ? '#ff8a3d' : tint, { emissive: floor.id === 'main' ? '#ff6a1a' : tint, emissiveIntensity: 0.25 }), -1.2, 4.2, 0.18, back);
  mesh(new THREE.BoxGeometry(2.6, 0.08, 0.5), std('#e8ecff'), -1.2, 2.25, 0.4, back);
  [['#ff5c8a', 0.45], ['#2fe08a', 0.35], ['#ffc53d', 0.55], ['#4d7cff', 0.4], ['#b06bff', 0.3]].forEach(([c, s], i) =>
    build(mesh(new RoundedBoxGeometry(s, s, s, 2, 0.06), std(c), -2.2 + i * 0.5, 2.29 + s / 2, 0.4, back), 'pop', 0.9 + i * 0.05));
  mesh(new THREE.PlaneGeometry(1.2, 0.8), glow(floor.id === 'main' ? '#2fe08a' : tint, 0.8), 0.17, 3.6, 1.6, left).rotation.y = Math.PI / 2;
}

/** Draw one object; returns its record. live = animate it in now. */
export function drawObj(floor, o, live = false) {
  const color = o.type === 'office' ? (byKey(o.agentKey)?.a.color || '#94a3b8') : undefined;
  const { group, parts } = drawObject(o, color);
  group.userData.objId = o.id; group.userData.floorId = floor.id;
  FL.groups.get(floor.id).add(group);
  const rec = { floorId: floor.id, obj: o, group, parts };
  FL.drawn.set(o.id, rec);
  const delay = o.type === 'office' ? 0.6 : 0.75;
  if (parts.anim) parts.anim.forEach(([obj, kind], k) => build(obj, kind, delay + k * 0.2));
  else build(group, 'drop', delay);
  if (o.type === 'core') { setCorePos(o.x, o.z); setCoreVisible(S.viewFloor === floor.id); }
  if (live) {
    const tl = gsap.timeline();
    if (parts.anim) parts.anim.forEach(([obj, kind], k) => animateIn(tl, obj, kind, k * 0.15)); else animateIn(tl, group, 'drop', 0);
  }
  return rec;
}
export function undrawObj(id) {
  const rec = FL.drawn.get(id); if (!rec) return;
  rec.group.parent?.remove(rec.group);
  const objs = new Set(); rec.group.traverse(o => objs.add(o));
  for (let k = BUILD.length - 1; k >= 0; k--) if (objs.has(BUILD[k].obj)) BUILD.splice(k, 1);
  rec.group.traverse(o => o.geometry?.dispose());
  FL.drawn.delete(id);
}

export function buildFloor(floor, live = false) {
  const g = new THREE.Group(); g.visible = S.viewFloor === floor.id; world.add(g);
  FL.groups.set(floor.id, g);
  shell(floor, g);
  floor.objects.forEach(o => drawObj(floor, o, live));
  rebuildNav(floor);
}
export function removeFloorGroup(id) { const g = FL.groups.get(id); if (g) { world.remove(g); FL.groups.delete(id); } }

export function setView(id) {
  S.viewFloor = id;
  FL.groups.forEach((g, fid) => { g.visible = fid === id; });
  const core = S.floors.flatMap(f => f.objects.map(o => ({ f, o }))).find(x => x.o.type === 'core');
  setCoreVisible(!!core && core.f.id === id);
  emit('floor-changed', id);
}

export const saveFloor = f => put('floors', f.id, { id: f.id, name: f.name, dept: f.dept || '', color: f.color, order: f.order, objects: f.objects, at: Date.now() });

/** Interaction spots on a floor, optionally filtered by kind. */
export function spotsOn(floorId, kinds) {
  const f = floorById(floorId); if (!f) return [];
  return f.objects.flatMap(spotsOf).filter(s => !kinds || kinds.includes(s.kind));
}
export const elevatorOf = floorId => spotsOn(floorId, ['elevator'])[0] || { x: 6, z: -6.5, face: 0 };

/** Find a free spot for a new office on a floor (no overlap, inside the room). */
export function findOfficeSpot(floor) {
  const fps = floor.objects.map(footprint);
  for (let z = -5.6; z <= 5.6; z += 0.5) for (let x = -6.0; x <= 6.0; x += 0.5) for (const door of [1, -1]) {
    const o = { type: 'office', x, z, rot: 0, door };
    const f = footprint(o);
    if (f.x1 < -7.8 || f.x2 > 7.8 || f.z1 < -7.8 || f.z2 > 7.8) continue;
    if (fps.some(p => p.x1 < f.x2 + 0.6 && p.x2 > f.x1 - 0.6 && p.z1 < f.z2 + 0.6 && p.z2 > f.z1 - 0.6)) continue;
    const s = door * 2.1, out = { x: x + s, z };
    if (!isFree(floor.id, out.x, out.z)) continue;
    return { x, z, door };
  }
  return null;
}
export { CATALOG };
