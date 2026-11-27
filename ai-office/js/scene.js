// The 3D world: renderer, camera, room, furniture, the hive core, effects and the frame loop.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { gsap, D, $, rand, pick, isPhone } from './util.js';
import { BUILTIN, CORE_POS, BASE_CORE } from './data.js';
import { S, V } from './state.js';

/* --------------------------------------------------------------- renderer */
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
catch (e) { $('err').style.display = 'grid'; throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('scene').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#050816');
const world = new THREE.Group();
scene.add(world);

/* camera: orthographic = true isometric look */
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
camera.position.set(20, 17, 20);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minPolarAngle = 0.55; controls.maxPolarAngle = 1.15;
controls.minAzimuthAngle = 0.1; controls.maxAzimuthAngle = 1.45;
controls.minZoom = 0.6; controls.maxZoom = 3;
controls.target.set(0, 0.5, 0);


/* --------------------------------------------------------------- lights */
const hemi = new THREE.HemisphereLight('#8ea6ff', '#0a0f25', 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffe2c4', 1.4);
sun.position.set(9, 16, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
sun.shadow.bias = -0.0005;
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun);
const windowLight = new THREE.PointLight('#8fb7ff', 18, 14, 2);
windowLight.position.set(-6.5, 4, -6);
scene.add(windowLight);

/* --------------------------------------------------------------- helpers */
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...o });
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
function mesh(geo, mat, x = 0, y = 0, z = 0, parent = world) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
const BUILD = []; // everything that animates in during the build sequence
const build = (obj, kind, delay = 0) => { obj.userData.home = obj.position.clone(); obj.userData.scaleHome = obj.scale.clone(); BUILD.push({ obj, kind, delay }); return obj; };

/* --------------------------------------------------------------- room shells live in floors.js */
const tiles = []; // flickering floor tiles of every floor (filled by floors.js)
const windowPanes = []; // window glass of every floor, tinted by the day cycle

/* --------------------------------------------------------------- stations */
function screenTexture(color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = '#0a1028'; g.fillRect(0, 0, 256, 320);
  for (let y = 12; y < 320; y += 13) {
    g.fillStyle = Math.random() < 0.3 ? color : 'rgba(200,215,255,.55)';
    g.fillRect(14 + ((Math.random() * 3) | 0) * 16, y, rand(30, 170), 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 0.5);
  return t;
}

const deskMat = std('#1b2550', { roughness: 0.5 });
const legMat = std('#0c1230');

/* --------------------------------------------------------------- hive core */
const CORE = new THREE.Group(); CORE.position.copy(CORE_POS); world.add(CORE);
const corePos = CORE_POS.clone(); // movable in the office editor
const coreU = {
  uA: { value: BASE_CORE.clone() }, uTime: { value: 0 }, uStorm: { value: 0 }, uIgnite: { value: 0 },
};
const coreMat = new THREE.ShaderMaterial({
  uniforms: coreU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  vertexShader: `
    uniform float uTime, uStorm; varying vec3 vN; varying vec3 vP;
    void main(){
      vec3 p = position;
      float d = sin(p.y*6.0+uTime*2.0)*sin(p.x*5.0+uTime*1.3)*0.05*(1.0+uStorm*4.0);
      p += normal*d;
      vN = normalize(normalMatrix*normal); vP = p;
      gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0);
    }`,
  fragmentShader: `
    uniform vec3 uA; uniform float uTime, uStorm, uIgnite; varying vec3 vN; varying vec3 vP;
    void main(){
      float f = pow(1.0 - abs(vN.z), 2.0);
      float band = 0.5 + 0.5*sin(vP.y*9.0 - uTime*3.0 + sin(vP.x*4.0 + uTime));
      vec3 col = uA*(0.25 + band*0.45) + uA*f*1.6 + vec3(1.0)*f*uStorm*1.5;
      gl_FragColor = vec4(col*uIgnite*(1.0+uStorm), (0.35 + f*0.65)*uIgnite);
    }`,
});
const coreBall = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 24), coreMat); CORE.add(coreBall);
const coreWire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 2), new THREE.MeshBasicMaterial({ color: '#c9b6ff', wireframe: true, transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
CORE.add(coreWire);
// particle cloud
const cloud = (() => {
  const N = innerWidth <= 760 ? 1100 : 1800, pos = new Float32Array(N * 3), cols = new Float32Array(N * 3);
  const palette = BUILTIN.map(a => new THREE.Color(a.color)).concat([new THREE.Color('#ffffff'), new THREE.Color('#ffffff')]);
  for (let k = 0; k < N; k++) {
    const r = rand(0.95, 1.9) * (Math.random() < 0.12 ? 1.25 : 1), th = Math.random() * Math.PI * 2, ph = Math.acos(rand(-1, 1));
    pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.8, r * Math.sin(ph) * Math.sin(th)], k * 3);
    const c = pick(palette); cols.set([c.r, c.g, c.b], k * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.5 * renderer.getPixelRatio(), sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  CORE.add(p); return p;
})();
const orbits = [1.3, 1.6, 1.95].map((r, k) => {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 8, 160), glow(k === 1 ? '#ffffff' : '#a98bff', 0));
  m.rotation.set(rand(0, Math.PI), rand(0, Math.PI), 0); m.userData.spin = new THREE.Vector3(rand(-.4, .4), rand(.2, .6), rand(-.3, .3));
  CORE.add(m); return m;
});
// pedestal
const pedestal = new THREE.Group(); pedestal.position.set(CORE_POS.x, 0, CORE_POS.z); world.add(pedestal);
pedestal.userData.isCore = true;
mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.25, 48), std('#141d45', { metalness: 0.5, roughness: 0.35 }), 0, 0.125, 0, pedestal);
const padRing = mesh(new THREE.TorusGeometry(1.05, 0.03, 8, 96), glow('#9d7bff', 0.9), 0, 0.26, 0, pedestal); padRing.rotation.x = Math.PI / 2;
build(pedestal, 'pop', 1.0);
const coreLight = new THREE.PointLight('#9d7bff', 0, 12, 1.6); coreLight.position.copy(CORE_POS); world.add(coreLight);

/** True when the object and all its parents are visible (i.e. on the floor being viewed). */
function shown(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }

/** Move the hive core (editor) and show it only on its own floor. */
function setCorePos(x, z) {
  corePos.set(x, CORE_POS.y, z); CORE.position.set(x, CORE.position.y, z);
  pedestal.position.set(x, 0, z); coreLight.position.set(x, CORE_POS.y, z);
  if (pedestal.userData.home) pedestal.userData.home.set(x, 0, z);
}
function setCoreVisible(v) { CORE.visible = v; pedestal.visible = v; coreLight.visible = v; }

/* --------------------------------------------------------------- effects */
const bursts = [];
function burst(target, color, count = 120, speed = 6, life = 2.2, size = 0.25) {
  if (!target.isVector3 && !shown(target)) return;
  const p0 = target.isVector3 ? target : target.getWorldPosition(new THREE.Vector3());
  const pos = new Float32Array(count * 3), vel = [];
  for (let k = 0; k < count; k++) {
    pos.set([p0.x, p0.y, p0.z], k * 3);
    vel.push(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.3, 1)));
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: (2 + size * 5) * renderer.getPixelRatio(), sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  scene.add(pts);
  bursts.push({ pts, vel, life, max: life });
}
function ring3d(target, color, size = 6, dur = 1.5, thick = 0.3) {
  if (!shown(target)) return;
  const p0 = target.getWorldPosition(new THREE.Vector3());
  const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.02 * thick * 3, 8, 128), glow(color, 1));
  m.position.copy(p0); m.rotation.set(rand(-0.6, 0.6) + Math.PI / 2, rand(-0.6, 0.6), 0);
  m.scale.setScalar(0.3); scene.add(m);
  gsap.to(m.scale, { x: size, y: size, z: size, duration: D(dur), ease: 'expo.out' });
  gsap.to(m.material, { opacity: 0, duration: D(dur), ease: 'power2.in', onComplete: () => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); } });
}
function flash(color, amount) {
  const el = $('flash');
  el.style.background = `radial-gradient(circle at 70% 45%, ${color}, transparent 70%)`;
  gsap.fromTo(el, { opacity: Math.min(amount, 1) * 0.55 }, { opacity: 0, duration: D(0.9), ease: 'power2.out' });
}
const kick = strength => gsap.fromTo(V, { shake: strength }, { shake: 0, duration: D(0.6), ease: 'power2.out' });
const boost = (ag, amp, dur) => gsap.fromTo(ag, { boost: amp }, { boost: 0, duration: D(dur), ease: 'power2.out' });

function stormEvent(ag, color, strength = 1) {
  const c = new THREE.Color(color);
  coreU.uA.value.copy(c); coreLight.color.copy(c);
  gsap.fromTo(V, { storm: strength }, { storm: 0, duration: D(2.2), ease: 'power3.out' });
  gsap.delayedCall(D(1.9), () => { gsap.to(coreU.uA.value, { r: BASE_CORE.r, g: BASE_CORE.g, b: BASE_CORE.b, duration: D(1) }); coreLight.color.copy(BASE_CORE); });
  flash(color, 0.6 * strength); kick(0.7 * strength);
  burst(CORE, color, 90, 6, 2.2, 0.15); burst(CORE, '#ffffff', 30, 3.5, 1.6, 0.1);
  ring3d(CORE, color, 8, 1.5, 0.35); gsap.delayedCall(D(0.18), () => ring3d(CORE, '#ffffff', 5, 1.3, 0.25));
  if (ag) { ring3d(ag.parts.ring, color, 3.2, 1.2, 0.4); boost(ag, 1.2, 1.6); }
  else S.agents.forEach(o => boost(o, 1.2, 1.6));
}

/* a glowing packet travels along the beam from a desk to the core */
function sendPulse(ag) {
  if (!ag.beam || !shown(ag.beam.line)) return;
  const { curve, line } = ag.beam;
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), glow(ag.a.color, 1)); scene.add(dot);
  const s = { t: 0 };
  gsap.to(line.material, { opacity: 0.8, duration: D(0.2), yoyo: true, repeat: 1, repeatDelay: D(0.7) });
  gsap.to(s, { t: 1, duration: D(1.1), ease: 'power1.inOut',
    onUpdate: () => dot.position.copy(curve.getPoint(s.t)).add(world.position),
    onComplete: () => { scene.remove(dot); burst(CORE, ag.a.color, 40, 3, 1.2, 0.1); gsap.fromTo(V, { storm: 0.35 }, { storm: 0, duration: D(0.8) }); } });
}

/* --------------------------------------------------------------- post */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.45, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* --------------------------------------------------------------- hand-off beam between two desks */
export function handoffBeam(fromAg, toAg, seconds = 3.5) {
  if (fromAg.a.floorId !== toAg.a.floorId || !shown(fromAg.robot.parent)) return;
  const parent = fromAg.robot.parent;
  const a = fromAg.seat, b = toAg.seat;
  const p0 = new THREE.Vector3(a.x, 2.3, a.z), p2 = new THREE.Vector3(b.x, 2.3, b.z);
  const mid = p0.clone().lerp(p2, 0.5); mid.y += 2.2 + p0.distanceTo(p2) * 0.15;
  const curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
  const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(80));
  const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: fromAg.a.color, dashSize: 0.18, gapSize: 0.1, transparent: true, opacity: 0, toneMapped: false }));
  line.computeLineDistances(); parent.add(line);
  gsap.to(line.material, { opacity: 0.9, duration: D(0.3) });
  const colors = [fromAg.a.color, toAg.a.color, '#ffffff'];
  const runs = Math.max(3, Math.round(seconds / 0.45));
  for (let k = 0; k < runs; k++) {
    gsap.delayedCall(D(k * 0.4), () => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), glow(colors[k % 3], 1)); parent.add(dot);
      const s = { t: 0 };
      gsap.to(s, { t: 1, duration: D(1.1), ease: 'sine.inOut', onUpdate: () => dot.position.copy(curve.getPoint(s.t)),
        onComplete: () => { parent.remove(dot); dot.geometry.dispose(); dot.material.dispose(); } });
    });
  }
  gsap.delayedCall(D(seconds), () => {
    burst(new THREE.Vector3(p2.x, p2.y, p2.z).add(world.position), toAg.a.color, 50, 3, 1.3, 0.12);
    gsap.to(line.material, { opacity: 0, duration: D(0.6), onComplete: () => { parent.remove(line); geo.dispose(); line.material.dispose(); } });
  });
}

/* --------------------------------------------------------------- camera layout */
let VIEW = 15;
export function resize() {
  const aspect = innerWidth / innerHeight;
  VIEW = Math.max(14.5, 18 / aspect);
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth, innerHeight);
}
function updateProjection() {
  const aspect = innerWidth / innerHeight, halfH = VIEW / 2, halfW = halfH * aspect;
  const worldPerPx = (2 * halfH) / innerHeight / camera.zoom;
  // shift the view so the focus stays visible beside the open panel
  let sx = 0, sy = 0;
  if (isPhone()) sy = -V.shift * (innerHeight * (S.panel && S.panel !== 'chat' ? 0.74 : 0.56)) / 2 * worldPerPx;
  else if (S.panel === 'board') sy = -V.shift * Math.min(330, innerHeight * 0.46) / 2 * worldPerPx;
  else sx = -V.shift * (346 / 2) * worldPerPx;
  camera.left = -halfW + sx; camera.right = halfW + sx; camera.top = halfH + sy; camera.bottom = -halfH + sy;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

export function focusOn(p, zoom) {
  const off = camera.position.clone().sub(controls.target);
  gsap.to(controls.target, { x: p.x, y: p.y, z: p.z, duration: D(1.1), ease: 'power3.inOut', onUpdate: () => camera.position.copy(controls.target).add(off) });
  gsap.to(camera, { zoom, duration: D(1.1), ease: 'power3.inOut' });
}

/* --------------------------------------------------------------- build sequence (room + core) */
export function animateIn(tl, obj, kind, at) {
  const h = obj.userData.home, s = obj.userData.scaleHome;
  if (kind === 'floor') tl.fromTo(obj.scale, { x: 0.001, z: 0.001 }, { x: s.x, z: s.z, duration: D(0.9), ease: 'expo.out' }, at);
  else if (kind === 'wall') tl.fromTo(obj.scale, { y: 0.001 }, { y: s.y, duration: D(0.8), ease: 'expo.out' }, at);
  else if (kind === 'drop') tl.fromTo(obj.position, { y: h.y + 7 }, { y: h.y, duration: D(0.8), ease: 'bounce.out' }, at);
  else if (kind === 'pop') tl.fromTo(obj.scale, { x: 0.001, y: 0.001, z: 0.001 }, { x: s.x, y: s.y, z: s.z, duration: D(0.6), ease: 'back.out(2.2)' }, at);
  else if (kind === 'rise') tl.fromTo(obj.scale, { y: 0.001 }, { y: 1, duration: D(0.7), ease: 'expo.out' }, at);
  else if (kind === 'ring') tl.fromTo(obj.scale, { x: 0.001, y: 0.001 }, { x: 1, y: 1, duration: D(0.9), ease: 'expo.out' }, at);
}
let buildTl;
export function runBuild() {
  S.built = false;
  if (buildTl) buildTl.kill();
  const tl = buildTl = gsap.timeline({ onComplete: () => {
    S.built = true;
    S.agents.forEach(o => { if (o.beam && o.beam.line.material.opacity < 0.2) gsap.to(o.beam.line.material, { opacity: 0.22, duration: D(0.6) }); });
  } });
  BUILD.forEach(({ obj, kind, delay }) => animateIn(tl, obj, kind, kind === 'floor' ? 0 : kind === 'wall' ? 0.35 : delay));
  tl.fromTo(coreU.uIgnite, { value: 0 }, { value: 1, duration: D(0.8), ease: 'power2.in' }, 2.0);
  tl.fromTo(cloud.material, { opacity: 0 }, { opacity: 0.32, duration: D(1.2) }, 2.4);
  tl.fromTo(coreWire.material, { opacity: 0 }, { opacity: 0.18, duration: D(1) }, 2.4);
  orbits.forEach((o, k) => tl.fromTo(o.material, { opacity: 0 }, { opacity: 0.6, duration: D(0.8) }, 2.5 + k * 0.1));
  tl.fromTo(coreLight, { intensity: 0 }, { intensity: 14, duration: D(1) }, 2.4);
  S.agents.filter(o => o.beam).forEach((o, k) => tl.fromTo(o.beam.line.material, { opacity: 0 }, { opacity: 0.22, duration: D(0.6) }, 2.7 + k * 0.06));
  tl.call(() => stormEvent(null, '#c9a6ff', 1.3), null, 2.8);
}

/* --------------------------------------------------------------- frame loop */
const frameHooks = [];
export const Q = { bloom: true, level: 'balanced' }; // render quality, set by quality.js
export const onFrame = fn => frameHooks.push(fn);
const clockT = new THREE.Clock();
function frame() {
  const dt = Math.min(clockT.getDelta(), 0.1), t = clockT.elapsedTime;
  coreU.uTime.value = t; coreU.uStorm.value = V.storm;
  frameHooks.forEach(fn => fn(dt, t));

  coreBall.scale.setScalar(1 + V.storm * 0.25 + Math.sin(t * 2) * 0.02);
  coreWire.rotation.y += dt * 0.2; coreWire.rotation.x += dt * 0.07;
  cloud.rotation.y += dt * (0.12 + V.storm * 1.2);
  cloud.scale.setScalar(1 + V.storm * 0.2);
  orbits.forEach(o => { o.rotation.x += o.userData.spin.x * dt * (1 + V.storm * 4); o.rotation.y += o.userData.spin.y * dt * (1 + V.storm * 4); });
  CORE.position.y = corePos.y + Math.sin(t * 1.1) * 0.12;
  padRing.material.opacity = 0.6 + 0.3 * Math.sin(t * 2) + V.storm;
  if (S.built) coreLight.intensity = 10 + V.storm * 30 + Math.sin(t * 3) * 1.5;
  bloom.strength = 0.5 + V.storm * 0.35;
  for (const tl of tiles) tl.material.opacity = Math.max(0, Math.sin(t * 0.8 + tl.userData.phase)) * 0.12 + V.storm * 0.1;
  for (let b = bursts.length - 1; b >= 0; b--) {
    const B = bursts[b]; B.life -= dt;
    const arr = B.pts.geometry.attributes.position.array;
    for (let k = 0; k < B.vel.length; k++) {
      const v = B.vel[k]; arr[k * 3] += v.x * dt; arr[k * 3 + 1] += v.y * dt; arr[k * 3 + 2] += v.z * dt; v.multiplyScalar(0.95); v.y -= dt * 0.6;
    }
    B.pts.geometry.attributes.position.needsUpdate = true;
    B.pts.material.opacity = Math.max(0, B.life / B.max);
    if (B.life <= 0) { scene.remove(B.pts); B.pts.geometry.dispose(); B.pts.material.dispose(); bursts.splice(b, 1); }
  }
  world.position.set((Math.random() - 0.5) * V.shake * 0.25, (Math.random() - 0.5) * V.shake * 0.25, 0);
  controls.update();
  updateProjection();
  if (Q.bloom) composer.render(); else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
export const startLoop = () => frame();

export { shown, renderer, scene, world, camera, controls, std, glow, mesh, build, BUILD, screenTexture, deskMat, legMat, tiles, windowPanes,
  sun, hemi, windowLight, pedestal, coreLight, corePos, setCorePos, setCoreVisible, composer, bloom,
  CORE, coreBall, coreU, burst, ring3d, flash, kick, boost, stormEvent, sendPulse, RoundedBoxGeometry, THREE };
