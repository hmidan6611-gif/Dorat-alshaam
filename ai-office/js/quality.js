// Render quality: high (soft shadows, bloom, floor reflections), balanced, low; "auto" picks one from the frame rate.
import { renderer, composer, sun, onFrame, Q, resize, scene, camera } from './scene.js';
import { makeFloorReflection } from './reflect.js';
import { S } from './state.js';
import { FL } from './floors.js';
import { isPhone, emit } from './util.js';

const LEVELS = ['low', 'balanced', 'high'];
let mode = 'auto', level = isPhone() ? 'balanced' : 'high';
try { mode = localStorage.getItem('deskhive:quality') || 'auto'; } catch {}
if (mode !== 'auto') level = mode;
export const qualityMode = () => mode;
export const fps = { now: 60 };

const reflectors = new Map();
function setReflections(on) {
  FL.groups.forEach((g, id) => {
    let r = reflectors.get(id);
    if (on && !r) { r = makeFloorReflection(); g.add(r); reflectors.set(id, r); }
    if (r) r.visible = on;
  });
}
function apply(l) {
  level = l; Q.level = l;
  const dpr = devicePixelRatio || 1;
  const pr = l === 'high' ? Math.min(dpr, 2) : l === 'balanced' ? Math.min(dpr, 1.5) : 1;
  renderer.setPixelRatio(pr); composer.setPixelRatio?.(pr); resize();
  Q.bloom = l !== 'low';
  sun.castShadow = l !== 'low';
  const size = l === 'high' ? 2048 : 1024;
  if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  S.lowLights = l === 'low';
  setReflections(l === 'high');
  emit('quality-changed', l);
}
export function setQuality(m) {
  mode = m; try { localStorage.setItem('deskhive:quality', m); } catch {}
  apply(m === 'auto' ? (isPhone() ? 'balanced' : 'high') : m);
}
export function initQuality() {
  apply(level);
  let frames = 0, acc = 0, low = 0, good = 0, upgraded = false;
  onFrame(dt => {
    frames++; acc += dt;
    if (acc < 2) return;
    fps.now = Math.round(frames / acc); frames = 0; acc = 0;
    emit('fps', fps.now);
    if (mode !== 'auto' || document.hidden) return;
    if (fps.now < 42) { low++; good = 0; } else if (fps.now > 57) { good++; low = 0; } else { low = 0; good = 0; }
    const i = LEVELS.indexOf(level);
    if (low >= 2 && i > 0) { apply(LEVELS[i - 1]); low = 0; }
    else if (good >= 5 && i < 2 && !upgraded) { apply(LEVELS[i + 1]); upgraded = true; good = 0; }
  });
  // new floors get reflections too
  addEventListener('deskhive-floor-added', () => setReflections(level === 'high'));
  onFrame(() => {
    if (level !== 'high') return;
    const g = FL.groups.get(S.viewFloor), r = reflectors.get(S.viewFloor);
    if (g && r) r.userData.update(renderer, scene, camera, [g.userData.plate]);
  });
}
export const currentLevel = () => level;
