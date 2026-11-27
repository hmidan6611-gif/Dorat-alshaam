// Manager mode: free camera (pan, full rotation, wide zoom), double-click an agent to glide to it and follow it,
// and arrow keys / WASD to move around.
import { $, el, gsap, D } from './util.js';
import { S } from './state.js';
import { THREE, camera, controls, renderer, onFrame } from './scene.js';
import { showBubble } from './agents.js';

const LIMITS = { minPolar: 0.55, maxPolar: 1.15, minAz: 0.1, maxAz: 1.45, minZoom: 0.6, maxZoom: 3 };
let ui = {}, lastTap = 0;
const keys = new Set();
const v = new THREE.Vector3(), off = new THREE.Vector3();

function apply(on) {
  controls.enablePan = on; controls.screenSpacePanning = true;
  controls.minPolarAngle = on ? 0.15 : LIMITS.minPolar; controls.maxPolarAngle = on ? 1.45 : LIMITS.maxPolar;
  controls.minAzimuthAngle = on ? -Infinity : LIMITS.minAz; controls.maxAzimuthAngle = on ? Infinity : LIMITS.maxAz;
  controls.minZoom = on ? 0.35 : LIMITS.minZoom; controls.maxZoom = on ? 5 : LIMITS.maxZoom;
}
export function setManager(on) {
  S.manager = on;
  $('cam-btn').setAttribute('aria-pressed', String(on));
  document.body.classList.toggle('manager', on);
  apply(on);
  if (!on) { follow(null); camera.zoom = Math.min(Math.max(camera.zoom, LIMITS.minZoom), LIMITS.maxZoom); }
  $('cam-hint').hidden = !on;
}
export function follow(ag) {
  S.follow = ag;
  const chip = $('follow-chip');
  chip.hidden = !ag;
  if (ag) {
    $('follow-name').textContent = ag.a.name; chip.style.setProperty('--c', ag.a.color);
    gsap.to(camera, { zoom: 2.4, duration: D(1.2), ease: 'power3.inOut' });
    showBubble(ag, 'المدير يتابعني!', 1800);
  }
}

export function initManager(hooks) {
  ui = hooks;
  $('cam-btn').onclick = () => setManager(!S.manager);
  $('follow-stop').onclick = () => follow(null);
  const dbl = (x, y) => {
    if (!S.manager || S.editing) return;
    const ag = ui.pickAgent(x, y);
    follow(ag || null);
  };
  renderer.domElement.addEventListener('dblclick', e => dbl(e.clientX, e.clientY));
  renderer.domElement.addEventListener('pointerup', e => {           // double-tap on touch screens
    if (e.pointerType !== 'touch') return;
    const t = performance.now(); if (t - lastTap < 320) dbl(e.clientX, e.clientY); lastTap = t;
  });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && S.follow) follow(null);
    if (!S.manager || /input|textarea|select/i.test(document.activeElement?.tagName || '')) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key)) { keys.add(e.key); e.preventDefault(); }
  });
  addEventListener('keyup', e => keys.delete(e.key));
  onFrame(dt => {
    if (S.follow) {
      if (!S.agents.includes(S.follow) || S.follow.curFloor !== S.viewFloor) { follow(null); return; }
      S.follow.robot.getWorldPosition(v); v.y = 1.2;
      off.copy(camera.position).sub(controls.target);
      controls.target.lerp(v, 1 - Math.exp(-dt * 4));
      camera.position.copy(controls.target).add(off);
    } else if (keys.size) {
      // move along the ground relative to where the camera looks
      const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
      const m = new THREE.Vector3(), sp = 6 * dt / camera.zoom;
      if (keys.has('ArrowUp') || keys.has('w')) m.add(fwd);
      if (keys.has('ArrowDown') || keys.has('s')) m.sub(fwd);
      if (keys.has('ArrowRight') || keys.has('d')) m.add(right);
      if (keys.has('ArrowLeft') || keys.has('a')) m.sub(right);
      m.multiplyScalar(sp); controls.target.add(m); camera.position.add(m);
    }
  });
}
export { el };
