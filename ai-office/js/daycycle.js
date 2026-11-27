// Day cycle: morning, noon, sunset and night change the sky in the windows, the sun, the ambient light and desk lamps.
import { THREE, scene, renderer, sun, hemi, windowLight, windowPanes, onFrame } from './scene.js';
import { lampMats } from './layout.js';
import { $ } from './util.js';

// hour, background, window sky, hemisphere sky, ground, ambient, sun colour, sun strength, exposure, lamps
const KEYS = [
  [0, '#02040c', '#0b1430', '#3a4a8a', '#05070f', 0.45, '#8fa6ff', 0.25, 0.95, 1],
  [5.5, '#03050f', '#141c40', '#3a4a8a', '#05070f', 0.45, '#8fa6ff', 0.25, 0.95, 1],
  [6.6, '#0d0f24', '#ff9a76', '#f0a08a', '#1a1030', 0.62, '#ffb08a', 0.8, 1.0, 0.6],
  [9, '#050816', '#b9d2ff', '#8ea6ff', '#0a0f25', 0.9, '#ffe2c4', 1.4, 1.05, 0],
  [13, '#060a1c', '#d6e6ff', '#9fb4ff', '#0a0f25', 1.0, '#fff1dc', 1.6, 1.1, 0],
  [17.3, '#0a0818', '#ffb36b', '#e6a57a', '#1a0f20', 0.82, '#ffb070', 1.2, 1.05, 0.3],
  [19, '#07061a', '#a85cff', '#9b7ad6', '#120a24', 0.6, '#c77dff', 0.6, 1.0, 0.8],
  [20.6, '#02040c', '#0b1430', '#3a4a8a', '#05070f', 0.45, '#8fa6ff', 0.25, 0.95, 1],
  [24, '#02040c', '#0b1430', '#3a4a8a', '#05070f', 0.45, '#8fa6ff', 0.25, 0.95, 1],
];
const MODES = ['real', 'fast'];
let mode = 'real', fastStart = performance.now(), fastBase = 9;
try { mode = localStorage.getItem('deskhive:day') === 'fast' ? 'fast' : 'real'; } catch {}
// ?hour=22 starts the fast clock at a given hour (handy for checking the night look)
const qh = Number(new URLSearchParams(location.search).get('hour'));
if (qh >= 0 && qh < 24 && location.search.includes('hour')) { mode = 'fast'; fastBase = qh; }

export function hourNow() {
  if (mode === 'fast') return (fastBase + (performance.now() - fastStart) / 1000 / 30) % 24; // one hour every 30 s
  const d = new Date(); return d.getHours() + d.getMinutes() / 60;
}
export function dayPart(h = hourNow()) {
  if (h >= 5.5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'day';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}
const PART_LABEL = { morning: 'صباح', day: 'ظهر', evening: 'مغرب', night: 'ليل' };
const c1 = new THREE.Color(), c2 = new THREE.Color();
const mix = (a, b, t) => c1.set(a).lerp(c2.set(b), t).clone();

function apply(h) {
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
  const A = KEYS[i], B = KEYS[i + 1], t = (h - A[0]) / Math.max(0.001, B[0] - A[0]);
  const num = k => A[k] + (B[k] - A[k]) * t;
  scene.background = mix(A[1], B[1], t);
  const sky = mix(A[2], B[2], t).multiplyScalar(1.1);
  windowPanes.forEach(m => m.color.copy(sky));
  hemi.color.copy(mix(A[3], B[3], t)); hemi.groundColor.copy(mix(A[4], B[4], t)); hemi.intensity = num(5);
  sun.color.copy(mix(A[6], B[6], t)); sun.intensity = num(7);
  renderer.toneMappingExposure = num(8);
  const lamps = num(9);
  lampMats.forEach(m => { m.opacity = lamps; });
  windowLight.color.copy(sky); windowLight.intensity = 6 + 14 * (1 - lamps);
  // the sun travels across the sky; at night the "sun" is a dim moon from the other side
  const day = Math.max(0, Math.min(1, (h - 6) / 13));
  const ang = Math.PI * day;
  sun.position.set(Math.cos(ang) * 14 - 2, 6 + Math.sin(ang) * 12, 7);
}

export function initDayCycle() {
  const btn = $('daybtn');
  const label = () => {
    const h = hourNow(), hh = String(Math.floor(h)).padStart(2, '0'), mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
    $('daytext').textContent = `${PART_LABEL[dayPart(h)]} ${hh}:${mm}`;
    btn.title = mode === 'fast' ? 'الوقت مسرّع: ساعة كل 30 ثانية. اضغط للعودة إلى الوقت الحقيقي' : 'الوقت الحقيقي. اضغط لتسريع اليوم';
    btn.setAttribute('aria-pressed', String(mode === 'fast'));
    document.documentElement.dataset.daypart = dayPart(h);
  };
  btn.onclick = () => {
    if (mode === 'real') { fastBase = hourNow(); fastStart = performance.now(); }
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    try { localStorage.setItem('deskhive:day', mode); } catch {}
    label();
  };
  label(); setInterval(label, 1000);
  let acc = 1;
  onFrame(dt => { acc += dt; if (acc > 0.25) { acc = 0; apply(hourNow()); } });
}
