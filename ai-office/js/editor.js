// Office editor: add, drag, rotate and delete offices and furniture on the viewed floor.
// Walking paths are recomputed after every change, and a change that would trap an agent is refused.
import { $, el, button, uid, emit } from './util.js';
import { S, byKey } from './state.js';
import { THREE, camera, renderer, controls, world, setCorePos } from './scene.js';
import { FL, floorById, drawObj, undrawObj, saveFloor, elevatorOf, expandFloor } from './floors.js';
import { CATALOG, PLACEABLE, footprint, officeSeat, roomMax } from './layout.js';
import { rebuildNav, findPath } from './nav.js';
import { bindOffice, rebuildBeam, atDesk, walkTo } from './agents.js';

let ui = {}, drag = null, outline = null;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
const floorNow = () => floorById(S.viewFloor);
const snap = v => Math.round(v * 4) / 4;

function setHint(text, bad = false) { const h = $('edit-hint'); h.textContent = text; h.style.color = bad ? '#ffb4b6' : ''; }
function overlaps(floor, o) {
  const f = footprint(o);
  const hi = roomMax(floor) - 0.15;
  if (f.x1 < -7.85 || f.x2 > hi || f.z1 < -7.85 || f.z2 > hi) return true;
  return floor.objects.some(x => x !== o && x.id !== o.id && (() => { const p = footprint(x); return p.x1 < f.x2 - 0.05 && p.x2 > f.x1 + 0.05 && p.z1 < f.z2 - 0.05 && p.z2 > f.z1 + 0.05; })());
}
/** Every office must still reach the elevator. */
function reachable(floor) {
  rebuildNav(floor);
  const e = elevatorOf(floor.id);
  return floor.objects.filter(o => o.type === 'office').every(o => !!findPath(floor.id, officeSeat(o), e));
}
function showOutline(o, ok = true) {
  if (outline) { outline.parent?.remove(outline); outline.geometry.dispose(); outline = null; }
  if (!o) return;
  const f = footprint(o), w = f.x2 - f.x1, d = f.z2 - f.z1;
  outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.05, d)), new THREE.LineBasicMaterial({ color: ok ? '#34e08a' : '#ff5c5c', toneMapped: false }));
  outline.position.set((f.x1 + f.x2) / 2, 0.05, (f.z1 + f.z2) / 2);
  FL.groups.get(S.viewFloor).add(outline);
}
function redraw(floor, o) {
  if (o.type === 'office' && o.agentKey && byKey(o.agentKey)) bindOffice(byKey(o.agentKey));
  else { undrawObj(o.id); drawObj(floor, o); }
  if (o.type === 'core') { setCorePos(o.x, o.z); S.agents.forEach(rebuildBeam); }
}
/** After a layout change: re-path anyone walking, move seated agents with their office, save. */
function commit(floor) {
  rebuildNav(floor);
  S.agents.forEach(ag => {
    if (ag.curFloor !== floor.id || atDesk(ag)) return;
    const d = ag.mv.dest; if (!d) return;
    walkTo(ag, d.kind === 'seat' ? { ...ag.seat, floor: ag.a.floorId, sit: true, kind: 'seat' } : d, ag.mv.speed);
  });
  saveFloor(floor); emit('layout-changed', floor.id);
}

function pickObj(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const groups = [...FL.drawn.values()].filter(r => r.floorId === S.viewFloor).map(r => r.group);
  const hit = ray.intersectObjects(groups, true)[0]; if (!hit) return null;
  let g = hit.object; while (g && !g.userData.objId) g = g.parent;
  return g ? floorNow().objects.find(o => o.id === g.userData.objId) : null;
}
function groundAt(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(plane, hitP) ? { x: hitP.x - world.position.x, z: hitP.z - world.position.z } : null;
}
function select(o) {
  showOutline(o);
  const bar = $('edit-sel'); bar.replaceChildren();
  if (!o) { setHint('اختر قطعة لتحريكها، أو أضف قطعة جديدة من القائمة.'); return; }
  const c = CATALOG[o.type];
  bar.append(el('b', '', c.label + (o.type === 'office' && o.agentKey ? ` · ${byKey(o.agentKey)?.a.name || ''}` : '')));
  bar.append(button('btn', 'لف ↻', () => rotate(o)));
  if (o.type === 'office') bar.append(button('btn', 'قلب الباب', () => flipDoor(o)));
  if (!c.fixed && !c.unique) bar.append(button('btn danger', 'حذف', () => remove(o)));
  setHint('اسحب القطعة لتحريكها. الأخضر مكان صالح، والأحمر متداخل مع شيء آخر.');
}
function tryChange(o, apply, revert) {
  const floor = floorNow();
  apply();
  if (overlaps(floor, o)) { revert(); setHint('لا يمكن: ستتداخل مع قطعة أخرى أو تخرج من المكتب.', true); return false; }
  if (!reachable(floor)) { revert(); rebuildNav(floor); setHint('لا يمكن: هذا يسد طريق أحد الوكلاء إلى مكتبه أو إلى المصعد.', true); return false; }
  redraw(floor, o); commit(floor); showOutline(o); return true;
}
function rotate(o) { const r0 = o.rot || 0; tryChange(o, () => { o.rot = (r0 + 1) % 4; }, () => { o.rot = r0; }); }
function flipDoor(o) { const d0 = o.door || 1; tryChange(o, () => { o.door = -d0; }, () => { o.door = d0; }); }
function remove(o) {
  const floor = floorNow();
  if (o.type === 'office' && o.agentKey) { setHint(`في هذا المكتب ${byKey(o.agentKey)?.a.name || 'وكيل'}. انقل الوكيل أو احذفه أولاً.`, true); return; }
  floor.objects.splice(floor.objects.indexOf(o), 1); undrawObj(o.id);
  commit(floor); select(null);
}
function add(type) {
  const floor = floorNow();
  if (CATALOG[type].unique && S.floors.some(f => f.objects.some(o => o.type === type))) { setHint('هذه القطعة موجودة مرة واحدة فقط.', true); return; }
  const o = { id: uid(type), type, x: 0, z: 0, rot: 0, ...(type === 'office' ? { door: 1, agentKey: null } : {}) };
  for (let r = 0; r < 9; r += 0.5) {
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2; o.x = snap(Math.cos(a) * r); o.z = snap(Math.sin(a) * r);
      floor.objects.push(o);
      if (!overlaps(floor, o) && reachable(floor)) { drawObj(floor, o, true); commit(floor); select(o); return; }
      floor.objects.pop();
    }
  }
  rebuildNav(floor);
  setHint('لا توجد مساحة فارغة لهذه القطعة في هذا الطابق.', true);
}

/* ------------------------------------------------------------------ pointer handling while editing */
function onDown(e) {
  if (!S.editing) return;
  const o = pickObj(e.clientX, e.clientY);
  select(o);
  if (!o || CATALOG[o.type].fixed && o.type !== 'elevator') return;
  const p = groundAt(e.clientX, e.clientY); if (!p) return;
  drag = { o, dx: o.x - p.x, dz: o.z - p.z, x0: o.x, z0: o.z, moved: false };
  controls.enabled = false;
  renderer.domElement.setPointerCapture(e.pointerId);
}
function onMove(e) {
  if (!S.editing || !drag) return;
  const p = groundAt(e.clientX, e.clientY); if (!p) return;
  const o = drag.o, nx = snap(p.x + drag.dx), nz = snap(p.z + drag.dz);
  if (nx === o.x && nz === o.z) return;
  o.x = nx; o.z = nz; drag.moved = true;
  const rec = FL.drawn.get(o.id); rec.group.position.set(nx, 0, nz);
  showOutline(o, !overlaps(floorNow(), o));
}
function onUp() {
  if (!drag) return;
  controls.enabled = true;
  const { o, x0, z0, moved } = drag; drag = null;
  if (!moved) return;
  const nx = o.x, nz = o.z; o.x = x0; o.z = z0;
  if (!tryChange(o, () => { o.x = nx; o.z = nz; }, () => { o.x = x0; o.z = z0; })) {
    FL.drawn.get(o.id).group.position.set(x0, 0, z0); showOutline(o);
  }
}

export function setEditing(on) {
  S.editing = on;
  $('editbar').hidden = !on; $('edit-btn').setAttribute('aria-pressed', String(on));
  document.body.classList.toggle('editing', on);
  if (on) {
    ui.select(null); ui.showPanel(null);
    const pal = $('edit-palette'); pal.replaceChildren();
    PLACEABLE.forEach(t => pal.append(button('btn', '+ ' + CATALOG[t].label, () => add(t))));
    if (floorNow()?.size !== 20) {
      const grow = button('btn', '⤢ وسّع الطابق', () => { if (expandFloor(floorNow())) { grow.remove(); ui.focusRoom?.(1); setHint('صار الطابق أوسع: مساحة جديدة لمكاتب وأثاث نحو الأمام.'); } });
      pal.append(grow);
    }
    select(null);
  } else { select(null); controls.enabled = true; }
}
export function initEditor(hooks) {
  ui = hooks;
  $('edit-btn').onclick = () => setEditing(!S.editing);
  $('edit-done').onclick = () => setEditing(false);
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointercancel', onUp);
}
