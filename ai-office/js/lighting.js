// Your lighting settings: overall brightness and colour warmth. The day cycle applies them on top of the time of
// day, and room lights (lamps, ceiling lights) glow brighter in the evening and at night.
import { THREE } from './scene.js';
import { roomLights } from './layout.js';

const KEY = 'deskhive:light';
const prefs = { bright: 1, warmth: 'neutral' };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* private window */ }
prefs.bright = Math.max(0.6, Math.min(1.6, Number(prefs.bright) || 1));
if (!['warm', 'neutral', 'cool'].includes(prefs.warmth)) prefs.warmth = 'neutral';
export const lightPrefs = () => ({ ...prefs });
export function setLight(p) { Object.assign(prefs, p); try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private window */ } }

const WARM = new THREE.Color('#ffcf99'), COOL = new THREE.Color('#b9d0ff');
/** Tint a light colour toward the chosen warmth. */
export function tint(c, amount = 0.28) {
  if (prefs.warmth === 'warm') c.lerp(WARM, amount);
  else if (prefs.warmth === 'cool') c.lerp(COOL, amount);
  return c;
}
const BULB = { warm: '#ffd59a', neutral: '#ffe8c4', cool: '#e3ecff' };
/** Room lights: `night` 0..1 from the day cycle. */
export function applyRoomLights(night) {
  const on = 0.35 + 0.65 * night, b = prefs.bright;
  roomLights.forEach(r => {
    r.bulb.forEach(m => { m.color.set(BULB[prefs.warmth]).multiplyScalar(0.55 + 0.6 * on); });
    r.pool.color.set(BULB[prefs.warmth]); r.pool.opacity = Math.min(0.85, (0.12 + 0.5 * on) * b);
    if (r.cone) r.cone.opacity = 0.015 + 0.05 * on * b;
  });
}
