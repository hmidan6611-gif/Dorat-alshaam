// Seasonal office themes: Ramadan (lanterns, a crescent and warm string lights), Eid (balloons and coloured
// lights) and a general celebration. "Automatic" follows the Hijri calendar. Decorations are light: one
// instanced mesh for the bulbs per floor, a few small meshes, and a cheap twinkle a few times a second.
import { THREE, onFrame, glow, std, mesh } from './scene.js';
import { S } from './state.js';
import { FL, floorById } from './floors.js';
import { roomMax } from './layout.js';
import { on, pick } from './util.js';
import { showBubble } from './agents.js';

export const THEMES = { auto: 'تلقائي: مواسم وإلا إضاءة زينة', lights: 'إضاءة زينة دائمة', none: 'بدون', ramadan: 'رمضان', eid: 'العيد', party: 'احتفال' };
const KEY = 'deskhive:theme';
let mode = 'auto', active = 'none';
try { mode = localStorage.getItem(KEY) || 'auto'; } catch { /* private window */ }
export const themeMode = () => mode;
export const activeTheme = () => active;

/** Ramadan or Eid from the Umm al-Qura calendar (falls back to none where the calendar is unsupported). */
function fromCalendar(d = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric', day: 'numeric' }).formatToParts(d);
    const m = +parts.find(p => p.type === 'month').value, day = +parts.find(p => p.type === 'day').value;
    if (m === 9) return 'ramadan';
    if ((m === 10 && day <= 3) || (m === 12 && day >= 10 && day <= 13)) return 'eid';
  } catch { /* no Hijri calendar here */ }
  return 'lights';
}

const decos = new Map(); // floorId -> {group, bulbs, colors, balloons}
const PALETTE = {
  ramadan: ['#ffd166', '#ffb347', '#fff1c1'],
  eid: ['#ff5c8a', '#2fe08a', '#ffc53d', '#4d7cff', '#b06bff'],
  party: ['#22d3ee', '#f472b6', '#a3e635', '#facc15'],
  lights: ['#fff1c1', '#ffd9a0', '#ffe8c4'],
};

function stringLights(g, colors, hi) {
  // bulbs hang in shallow swags along the back wall and the left wall, just under the top
  const pts = [];
  const swag = (a, b, n, fixed, alongX) => { for (let i = 0; i <= n; i++) { const u = i / n, p = a + (b - a) * u, sag = Math.sin((u * 4 % 1) * Math.PI) * 0.35; pts.push(alongX ? [p, 5.35 - sag, fixed] : [fixed, 5.35 - sag, p]); } };
  swag(-7.8, hi - 0.3, Math.round((hi + 8) * 3), -7.95, true);
  swag(-7.8, hi - 0.3, Math.round((hi + 8) * 3), -7.95, false);
  const geo = new THREE.SphereGeometry(0.07, 10, 8);
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const bulbs = new THREE.InstancedMesh(geo, mat, pts.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  pts.forEach((p, i) => { m.setPosition(p[0], p[1], p[2]); bulbs.setMatrixAt(i, m); bulbs.setColorAt(i, c.set(colors[i % colors.length])); });
  bulbs.castShadow = false; g.add(bulbs);
  // the wire
  const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p[0], p[1] + 0.06, p[2]))), new THREE.LineBasicMaterial({ color: '#2a3460' }));
  g.add(wire);
  return bulbs;
}
function lantern(g, x, z, h, color) {
  const l = new THREE.Group(); l.position.set(x, h, z); g.add(l);
  const gold = std('#c9962b', { metalness: 0.7, roughness: 0.35 });
  mesh(new THREE.CylinderGeometry(0.004, 0.004, 5.9 - h, 4), std('#1a2150'), 0, (5.9 - h) / 2 + 0.3, 0, l);
  mesh(new THREE.ConeGeometry(0.2, 0.22, 8), gold, 0, 0.32, 0, l);
  const body = mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.42, 8, 1, true), glow(color, 1.4), 0, 0, 0, l); body.castShadow = false;
  mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.06, 8), gold, 0, -0.24, 0, l);
  l.userData.sway = Math.random() * 6;
  return l;
}
function balloon(g, x, z, color) {
  const b = new THREE.Group(); b.position.set(x, 0, z); g.add(b);
  const s = mesh(new THREE.SphereGeometry(0.26, 18, 14), std(color, { roughness: 0.25, metalness: 0.1, emissive: color, emissiveIntensity: 0.25 }), 0, 2.3, 0, b); s.scale.y = 1.15;
  mesh(new THREE.CylinderGeometry(0.004, 0.004, 2.0, 4), std('#e8ecff'), 0, 1.2, 0, b);
  b.userData.bob = Math.random() * 6;
  return b;
}

function decorate(floorId, theme) {
  const root = FL.groups.get(floorId); if (!root) return;
  const g = new THREE.Group(); g.name = 'theme'; root.add(g);
  const hi = roomMax(floorById(floorId));
  const d = { group: g, bulbs: null, colors: PALETTE[theme], lanterns: [], balloons: [] };
  d.bulbs = stringLights(g, d.colors, hi);
  if (theme === 'ramadan') {
    // a crescent and a star on the back wall, lanterns along both walls
    const cres = mesh(new THREE.TorusGeometry(0.55, 0.09, 10, 40, Math.PI * 1.35), glow('#ffd166', 1.6), -5.2, 4.3, -7.9, g); cres.rotation.z = 0.9; cres.castShadow = false;
    const star = mesh(new THREE.OctahedronGeometry(0.13), glow('#fff1c1', 1.8), -4.75, 4.55, -7.9, g); star.castShadow = false;
    [[-6.5, -7.6], [-2.4, -7.6], [1.6, -7.6], [-7.6, -4.6], [-7.6, -0.6], [-7.6, 3.4]].forEach(([x, z], i) => d.lanterns.push(lantern(g, x, z, 3.6 + (i % 2) * 0.35, i % 2 ? '#ffb347' : '#ffd166')));
  } else if (theme !== 'lights') {
    const spots = [[-7.2, -7.2], [-6.7, -7.3], [-7.3, -6.6], [hi - 0.8, -7.2], [hi - 1.3, -7.3]];
    spots.forEach(([x, z], i) => d.balloons.push(balloon(g, x, z, d.colors[i % d.colors.length])));
  }
  decos.set(floorId, d);
}
function clear() {
  decos.forEach(d => { d.group.parent?.remove(d.group); d.group.traverse(o => { o.geometry?.dispose(); }); });
  decos.clear();
}
export function applyTheme() {
  const want = mode === 'auto' ? fromCalendar() : mode;
  clear(); active = want;
  if (want !== 'none') S.floors.forEach(f => decorate(f.id, want));
  document.body.dataset.theme = want;
}
export function setTheme(m) { mode = THEMES[m] ? m : 'auto'; try { localStorage.setItem(KEY, mode); } catch { /* private window */ } applyTheme(); }

let acc = 0;
const tmp = new THREE.Color();
onFrame((dt, t) => {
  if (active === 'none') return;
  const d = decos.get(S.viewFloor); if (!d) return;
  d.lanterns.forEach(l => { l.rotation.z = Math.sin(t * 0.9 + l.userData.sway) * 0.05; });
  d.balloons.forEach(b => { b.position.y = Math.sin(t * 1.1 + b.userData.bob) * 0.12; b.rotation.y += dt * 0.2; });
  acc += dt; if (acc < 0.25) return; acc = 0;
  // twinkle: a few bulbs change brightness each tick
  const n = d.bulbs.count;
  for (let k = 0; k < 6; k++) {
    const i = (Math.random() * n) | 0;
    tmp.set(d.colors[i % d.colors.length]).multiplyScalar(0.45 + Math.random() * 0.75);
    d.bulbs.setColorAt(i, tmp);
  }
  d.bulbs.instanceColor.needsUpdate = true;
});

const GREET = { ramadan: ['رمضان كريم 🌙', 'مبارك عليكم الشهر', 'الله أكرم'], eid: ['عيدكم مبارك 🎉', 'كل عام وأنتم بخير', 'عساكم من عواده'], party: ['يوم حلو 🎉', 'احتفال!'] };
export function initThemes() {
  applyTheme();
  addEventListener('deskhive-floor-added', applyTheme);
  on('floor-resized', applyTheme);
  // now and then someone says something for the season
  setInterval(() => {
    if (!GREET[active] || document.hidden || !S.agents.length) return;
    const ag = pick(S.agents.filter(o => o.a.floorId === S.viewFloor && !o.task)); if (ag) showBubble(ag, pick(GREET[active]), 2800);
  }, 45000);
}
